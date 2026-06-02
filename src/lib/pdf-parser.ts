// Client-only PDF parsing utilities for Domínio reports.

export type PdfItem = { str: string; x: number; y: number; width: number };
export type PdfRow = {
  tokens: string[];
  items: PdfItem[];
  raw: string;
};

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist");
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

/**
 * Extract rows from a PDF by clustering text items by Y position.
 * Each PdfItem keeps its real width from pdf.js so callers can compute the
 * right-edge x (x + width) — Domínio reports right-align all numeric columns.
 */
export async function extractRows(file: File): Promise<PdfRow[]> {
  const pdfjs = await getPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const rows: PdfRow[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: PdfItem[] = [];
    for (const it of content.items as Array<{ str: string; transform: number[]; width?: number }>) {
      if (!it.str || !it.str.trim()) continue;
      const w = typeof it.width === "number" && it.width > 0 ? it.width : it.str.length * 5;
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5], width: w });
    }
    // Cluster items into rows by Y proximity (tolerance ~2.5pt). Within a row,
    // items can sit on slightly different baselines (e.g. numbers vs. text),
    // so a fixed-size bucket is unreliable.
    const sorted = [...items].sort((a, b) => b.y - a.y);
    const lines: PdfItem[][] = [];
    const Y_TOL = 2.5;
    for (const it of sorted) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last[0].y - it.y) <= Y_TOL) {
        last.push(it);
      } else {
        lines.push([it]);
      }
    }
    for (const lineRaw of lines) {
      const line = lineRaw.sort((a, b) => a.x - b.x);
      // Merge fragments that are visually contiguous (using real widths from pdf.js).
      const merged: PdfItem[] = [];
      for (const it of line) {
        const last = merged[merged.length - 1];
        const gap = last ? it.x - (last.x + last.width) : Infinity;
        if (last && gap < 1.5 && !/\s/.test(it.str) && !/\s/.test(last.str)) {
          last.str += it.str;
          last.width = it.x + it.width - last.x;
        } else {
          merged.push({ ...it });
        }
      }
      const tokens = merged.map((i) => i.str.trim()).filter(Boolean);
      if (tokens.length === 0) continue;
      rows.push({ tokens, items: merged, raw: tokens.join(" | ") });
    }
  }
  return rows;
}

// ---------- Value parsing helpers (Brazilian format) ----------

export function parseBrlNumber(raw: string): number {
  const clean = raw
    .replace(/R\$\s?/gi, "")
    .replace(/\s/g, "")
    .replace(/[DC]$/i, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(clean);
  return Number.isFinite(n) ? n : NaN;
}

export function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

const NUMBER_TOKEN = /^-?\d{1,3}(\.\d{3})*,\d{2}[DC]?$|^-?\d+,\d{2}[DC]?$/i;

export function isNumberToken(t: string): boolean {
  return NUMBER_TOKEN.test(t.replace(/\s/g, ""));
}

const CLASSIFICATION = /^\d+(\.\d+){2,}$/;

export function isClassification(t: string): boolean {
  return CLASSIFICATION.test(t);
}

// ---------- Functionality 1: Compare launches ----------

export type CompareResult = {
  classification: string;
  description: string;
  m1: number;
  m2: number;
  m3: number;
  headers: [string, string, string];
};

// Detects column headers like "01/2026", "Janeiro/2026", "Jan/2026", "01-2026".
const HEADER_TOKEN =
  /^(0?[1-9]|1[0-2])[\/\-.]\d{2,4}$|^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)[\/\-. ]\d{2,4}$/i;

export type HeaderInfo = {
  labels: [string, string, string];
  /** Left-edge x of each of the 3 month headers. */
  xs: [number, number, number];
  /** Right boundary x for column 3 (taken from the next header like "Saldo", or synthetic). */
  rightBoundary: number;
};

export function findColumnHeaders(rows: PdfRow[]): HeaderInfo | null {
  for (const row of rows) {
    const matches = row.items.filter((it) => HEADER_TOKEN.test(it.str.trim()));
    if (matches.length >= 3) {
      const picked = matches.slice(0, 3);
      // Find the first non-date item after the 3rd month header — that's the right boundary.
      const after = row.items.find((it) => it.x > picked[2].x + 5 && !HEADER_TOKEN.test(it.str.trim()));
      const rightBoundary = after ? after.x : picked[2].x + (picked[2].x - picked[1].x);
      return {
        labels: [picked[0].str.trim(), picked[1].str.trim(), picked[2].str.trim()],
        xs: [picked[0].x, picked[1].x, picked[2].x],
        rightBoundary,
      };
    }
  }
  return null;
}

export function findClassificationRow(
  rows: PdfRow[],
  classification: string,
): CompareResult | null {
  const header = findColumnHeaders(rows);
  const headers: [string, string, string] = header?.labels ?? ["Mês 1", "Mês 2", "Mês 3"];

  for (const row of rows) {
    const classItem = row.items.find((it) =>
      it.str.trim().split(/\s+/).includes(classification),
    );
    if (!classItem) continue;

    const numberItems = row.items.filter((it) => isNumberToken(it.str.trim()));
    if (numberItems.length < 3) continue;

    // Domínio right-aligns numbers within each column. Use right edge (x + width)
    // and assign each number to the column whose [left, nextLeft) range it falls in.
    // A number "belongs to" column i when its right edge is within ~5pt before the
    // next column's left edge (i.e., right_edge < boundary[i+1] - margin).
    let picked: (PdfItem | null)[];
    if (header) {
      const boundaries = [header.xs[0], header.xs[1], header.xs[2], header.rightBoundary];
      const MARGIN = 5; // small gap before the next column header
      picked = [null, null, null];
      for (const n of numberItems) {
        const rightEdge = n.x + n.width;
        for (let i = 0; i < 3; i++) {
          if (rightEdge > boundaries[i] - 30 && rightEdge <= boundaries[i + 1] - MARGIN + 2) {
            // Keep the rightmost candidate per column (in case of fragments).
            if (!picked[i] || rightEdge > picked[i]!.x + picked[i]!.width) {
              picked[i] = n;
            }
            break;
          }
        }
      }
    } else {
      picked = numberItems.slice(0, 3);
    }

    if (!picked[0] || !picked[1] || !picked[2]) continue;

    // Description = tokens between classification and the first numeric item.
    const firstNumX = Math.min(...numberItems.map((n) => n.x));
    const desc = row.items
      .filter((it) => it.x > classItem.x + classItem.width - 0.1 && it.x < firstNumX)
      .map((it) => it.str.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    return {
      classification,
      description: desc,
      m1: parseBrlNumber(picked[0]!.str),
      m2: parseBrlNumber(picked[1]!.str),
      m3: parseBrlNumber(picked[2]!.str),
      headers,
    };
  }
  return null;
}

export type Variation = {
  label: string;
  previous: number;
  current: number;
  diff: number;
  percent: number;
  divergent: boolean;
};

export function compareVariation(
  label: string,
  previous: number,
  current: number,
): Variation {
  const base = Math.abs(previous);
  const percent = base === 0 ? (current === 0 ? 0 : Infinity) : ((current - previous) / base) * 100;
  return {
    label,
    previous,
    current,
    diff: current - previous,
    percent,
    divergent: Math.abs(percent) > 30,
  };
}

// ---------- Functionality 2: Inverted balance ----------

export type AccountRow = {
  classification: string;
  description: string;
  saldoAtualRaw: string;
  saldoAtualNum: number;
  natureza: "D" | "C" | null;
};

export function extractAccountRows(rows: PdfRow[]): AccountRow[] {
  const out: AccountRow[] = [];
  for (const row of rows) {
    const classIdx = row.tokens.findIndex(isClassification);
    if (classIdx === -1) continue;
    const classification = row.tokens[classIdx];
    const nums = row.tokens.filter(isNumberToken);
    if (nums.length === 0) continue;
    const last = nums[nums.length - 1];
    const natureza = /D$/i.test(last) ? "D" : /C$/i.test(last) ? "C" : null;
    const firstNumIdx = row.tokens.findIndex(isNumberToken);
    const description = row.tokens.slice(classIdx + 1, firstNumIdx).join(" ");
    out.push({
      classification,
      description,
      saldoAtualRaw: last,
      saldoAtualNum: parseBrlNumber(last),
      natureza,
    });
  }
  return out;
}

export type InvertedResult = {
  inverted: Array<AccountRow & { expected: "D" | "C" }>;
  lowBalance: AccountRow[];
};

export function analyzeInverted(accounts: AccountRow[]): InvertedResult {
  const inverted: Array<AccountRow & { expected: "D" | "C" }> = [];
  const lowBalance: AccountRow[] = [];
  for (const a of accounts) {
    const first = a.classification.charAt(0);
    let expected: "D" | "C" | null = null;
    if (first === "1" || first === "3") expected = "D";
    else if (first === "2" || first === "4") expected = "C";
    if (expected && a.natureza && a.natureza !== expected) {
      inverted.push({ ...a, expected });
    }
    if (a.saldoAtualNum > 0 && a.saldoAtualNum < 10) {
      lowBalance.push(a);
    }
  }
  return { inverted, lowBalance };
}
