// Client-only PDF parsing utilities for Domínio reports.

export type PdfItem = { str: string; x: number; y: number };
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
      const version = (pdfjs as unknown as { version: string }).version;
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

/**
 * Extract rows from a PDF by clustering text items by Y position.
 * Adjacent items on the same line are merged when their X distance is small
 * (handles cases where pdf.js splits a single visual token into pieces).
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
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5] });
    }
    const buckets = new Map<number, PdfItem[]>();
    for (const it of items) {
      const key = Math.round(it.y / 2) * 2;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(it);
    }
    const keys = Array.from(buckets.keys()).sort((a, b) => b - a);
    for (const k of keys) {
      const line = buckets.get(k)!.sort((a, b) => a.x - b.x);
      // Merge adjacent items that are visually contiguous (gap < ~3px).
      const merged: PdfItem[] = [];
      for (const it of line) {
        const last = merged[merged.length - 1];
        if (last && it.x - (last.x + last.str.length * 3) < 3 && it.str.trim().length > 0 && !/\s/.test(it.str)) {
          last.str += it.str;
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
  xs: [number, number, number];
};

export function findColumnHeaders(rows: PdfRow[]): HeaderInfo | null {
  for (const row of rows) {
    const matches = row.items.filter((it) => HEADER_TOKEN.test(it.str.trim()));
    if (matches.length >= 3) {
      // Take the last three date headers on the row (in case extra ones appear before).
      const picked = matches.slice(-3);
      return {
        labels: [picked[0].str.trim(), picked[1].str.trim(), picked[2].str.trim()],
        xs: [picked[0].x, picked[1].x, picked[2].x],
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
    const classItem = row.items.find((it) => it.str.trim() === classification);
    if (!classItem) continue;

    const numberItems = row.items.filter((it) => isNumberToken(it.str.trim()));
    if (numberItems.length < 3) continue;

    // Pick the numeric item whose x is closest to each header x. If no headers,
    // fall back to the first three numbers on the row.
    let picked: PdfItem[];
    if (header) {
      picked = header.xs.map((hx) =>
        numberItems.reduce((best, cur) =>
          Math.abs(cur.x - hx) < Math.abs(best.x - hx) ? cur : best,
        ),
      );
    } else {
      picked = numberItems.slice(0, 3);
    }

    // Description = tokens between classification and the first numeric item.
    const firstNumX = Math.min(...numberItems.map((n) => n.x));
    const desc = row.items
      .filter((it) => it.x > classItem.x && it.x < firstNumX)
      .map((it) => it.str.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    return {
      classification,
      description: desc,
      m1: parseBrlNumber(picked[0].str),
      m2: parseBrlNumber(picked[1].str),
      m3: parseBrlNumber(picked[2].str),
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
