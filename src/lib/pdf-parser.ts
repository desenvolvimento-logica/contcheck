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
const FIFTH_LEVEL = /^\d\.\d\.\d\.\d{2}\.\d{3}$/;

export function isClassification(t: string): boolean {
  return CLASSIFICATION.test(t);
}

export function isFifthLevelClassification(t: string): boolean {
  return FIFTH_LEVEL.test(t);
}

// ---------- Functionality 1: Compare launches ----------

export type CompareResult = {
  classification: string;
  description: string;
  /** Values for each month column, in left-to-right order. */
  values: number[];
  /** Header labels for each month column, in left-to-right order. */
  headers: string[];
};

export type HeaderInfo = {
  labels: string[];
  /** Left-edge x of each data column header. */
  xs: number[];
  /** Right boundary x for the last data column (taken from "Saldo Acumulado" if present, or synthetic). */
  rightBoundary: number;
};

const DESC_TOKEN = /^descri[cç][aã]o$/i;
const SALDO_TOKEN = /^saldo$/i;

/**
 * Locates the header row by finding "Descrição" and takes ALL columns to its
 * right as data columns, in left-to-right order. If a "Saldo Acumulado"
 * column exists, it is used as the right boundary and excluded from data columns.
 */
export function findColumnHeaders(rows: PdfRow[]): HeaderInfo | null {
  for (const row of rows) {
    const descItem = row.items.find((it) => DESC_TOKEN.test(it.str.trim()));
    if (!descItem) continue;
    const after = row.items
      .filter((it) => it.x > descItem.x + descItem.width - 0.1)
      .sort((a, b) => a.x - b.x);
    if (after.length === 0) continue;

    // Identify "Saldo Acumulado" boundary if present.
    const saldoIdx = after.findIndex(
      (it) => SALDO_TOKEN.test(it.str.trim()) || /saldo\s+acumulado/i.test(it.str.trim()),
    );
    const dataItems = saldoIdx === -1 ? after : after.slice(0, saldoIdx);
    if (dataItems.length === 0) continue;

    // Merge fragments belonging to the same header label (e.g. "Janeiro" + "/2026").
    const merged: PdfItem[] = [];
    for (const it of dataItems) {
      const last = merged[merged.length - 1];
      const gap = last ? it.x - (last.x + last.width) : Infinity;
      if (last && gap < 8) {
        last.str = (last.str + (gap > 1 ? " " : "") + it.str).trim();
        last.width = it.x + it.width - last.x;
      } else {
        merged.push({ ...it });
      }
    }
    if (merged.length === 0) continue;

    const lastCol = merged[merged.length - 1];
    let rightBoundary: number;
    if (saldoIdx !== -1) {
      rightBoundary = after[saldoIdx].x;
    } else if (merged.length > 1) {
      const gap = merged[merged.length - 1].x - merged[merged.length - 2].x;
      rightBoundary = lastCol.x + gap;
    } else {
      rightBoundary = lastCol.x + lastCol.width + 80;
    }

    return {
      labels: merged.map((m) => m.str.trim()),
      xs: merged.map((m) => m.x),
      rightBoundary,
    };
  }
  return null;
}

export function findClassificationRow(
  rows: PdfRow[],
  classification: string,
): CompareResult | null {
  const header = findColumnHeaders(rows);
  if (!header) {
    console.warn("[pdf-parser] Cabeçalho não encontrado. Buscando 'Descrição' nas linhas:",
      rows.slice(0, 30).map((r) => r.raw));
    return null;
  }
  console.log("[pdf-parser] Cabeçalho detectado:", header);
  const headers = header.labels;
  const nCols = headers.length;

  const candidateRows: Array<{ raw: string; reason: string }> = [];

  for (const row of rows) {
    const classItem = row.items.find((it) => {
      const s = it.str.trim();
      return (
        s === classification ||
        s.split(/\s+/).includes(classification) ||
        s.includes(classification)
      );
    });
    if (!classItem) continue;

    const numberItems = row.items.filter((it) => isNumberToken(it.str.trim()));
    if (numberItems.length < nCols) {
      candidateRows.push({
        raw: row.raw,
        reason: `números encontrados=${numberItems.length} < colunas=${nCols}`,
      });
      continue;
    }

    const boundaries = [...header.xs, header.rightBoundary];
    const MARGIN = 5;
    const picked: (PdfItem | null)[] = new Array(nCols).fill(null);
    for (const n of numberItems) {
      const rightEdge = n.x + n.width;
      for (let i = 0; i < nCols; i++) {
        if (rightEdge > boundaries[i] - 30 && rightEdge <= boundaries[i + 1] - MARGIN + 2) {
          if (!picked[i] || rightEdge > picked[i]!.x + picked[i]!.width) {
            picked[i] = n;
          }
          break;
        }
      }
    }

    if (picked.some((p) => !p)) {
      candidateRows.push({
        raw: row.raw,
        reason: `colunas não preenchidas. picked=${JSON.stringify(
          picked.map((p, i) => ({ col: headers[i], val: p?.str ?? null })),
        )} | boundaries=${JSON.stringify(boundaries)} | numbers=${JSON.stringify(
          numberItems.map((n) => ({ s: n.str, x: n.x, right: n.x + n.width })),
        )}`,
      });
      continue;
    }

    const firstNumX = Math.min(...numberItems.map((n) => n.x));
    const desc = row.items
      .filter((it) => it.x > classItem.x + classItem.width - 0.1 && it.x < firstNumX)
      .map((it) => it.str.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    console.log("[pdf-parser] Linha aceita:", { classification, desc, values: picked.map((p) => p!.str) });
    return {
      classification,
      description: desc,
      values: picked.map((p) => parseBrlNumber(p!.str)),
      headers,
    };
  }

  console.warn(
    `[pdf-parser] Classificação "${classification}" não encontrada. ${candidateRows.length} candidatas rejeitadas:`,
    candidateRows,
  );
  throw new Error("Classificação não encontrada");
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

export type ClassificationRow = {
  /** "Código" column value, when present in the report. */
  code: string;
  classification: string;
  description: string;
  values: number[];
  /** Variation % from previous month for each column (variations[0] = null). */
  variations: (number | null)[];
  /** Average of absolute variations across all month-to-month comparisons. */
  avgVariation: number;
  /** True if any month-to-month variation exceeds 30%. */
  hasDivergence: boolean;
};

export type AllClassificationsResult = {
  headers: string[];
  rows: ClassificationRow[];
  companyName: string;
};

/**
 * Extracts the company name from a Domínio report. The label "Empresa:" may
 * appear as its own token or glued to the value (e.g. "Empresa: ACME LTDA").
 * The value can also span multiple tokens on the same visual row.
 */
export function extractCompanyName(rows: PdfRow[]): string {
  for (const row of rows) {
    for (let i = 0; i < row.tokens.length; i++) {
      const t = row.tokens[i];
      const m = t.match(/^empresa\s*:\s*(.*)$/i);
      if (!m) continue;
      let name = m[1].trim();
      if (!name && i + 1 < row.tokens.length) {
        // Value is in following tokens on the same row; stop at next label.
        const rest: string[] = [];
        for (let j = i + 1; j < row.tokens.length; j++) {
          if (/^(cnpj|per[íi]odo|data|filial|regime|cidade|uf|munic[íi]pio)\s*:/i.test(row.tokens[j])) break;
          rest.push(row.tokens[j]);
        }
        name = rest.join(" ").trim();
      } else if (name && i + 1 < row.tokens.length) {
        // Some reports split the name across siblings after "Empresa: FOO BAR"
        for (let j = i + 1; j < row.tokens.length; j++) {
          if (/^(cnpj|per[íi]odo|data|filial|regime|cidade|uf|munic[íi]pio)\s*:/i.test(row.tokens[j])) break;
          name += " " + row.tokens[j];
        }
        name = name.trim();
      }
      if (name) return name.replace(/\s+/g, " ").slice(0, 255);
    }
  }
  return "";
}

export function extractAllFifthLevelRows(
  rows: PdfRow[],
): AllClassificationsResult | null {
  const header = findColumnHeaders(rows);
  if (!header) return null;
  const headers = header.labels;
  const nCols = headers.length;
  const boundaries = [...header.xs, header.rightBoundary];
  const MARGIN = 5;

  const out: ClassificationRow[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    let classification: string | null = null;
    let classItem: PdfItem | null = null;
    for (const it of row.items) {
      const s = it.str.trim();
      if (isFifthLevelClassification(s)) {
        classification = s;
        classItem = it;
        break;
      }
      const match = s.split(/\s+/).find((p) => isFifthLevelClassification(p));
      if (match) {
        classification = match;
        classItem = it;
        break;
      }
    }
    if (!classItem || !classification) continue;
    if (seen.has(classification)) continue;

    const numberItems = row.items.filter((it) => isNumberToken(it.str.trim()));
    if (numberItems.length < nCols) {
      console.log("[pdf-parser] Pulando", classification, "- números insuficientes:", numberItems.length, "<", nCols, "row:", row.raw);
      continue;
    }

    const picked: (PdfItem | null)[] = new Array(nCols).fill(null);
    for (const n of numberItems) {
      const rightEdge = n.x + n.width;
      for (let i = 0; i < nCols; i++) {
        if (rightEdge > boundaries[i] - 30 && rightEdge <= boundaries[i + 1] - MARGIN + 2) {
          if (!picked[i] || rightEdge > picked[i]!.x + picked[i]!.width) {
            picked[i] = n;
          }
          break;
        }
      }
    }
    if (picked.some((p) => !p)) {
      console.log("[pdf-parser] Pulando", classification, "- colunas não preenchidas. picked:",
        picked.map((p, i) => ({ col: headers[i], val: p?.str ?? null })),
        "| boundaries:", boundaries,
        "| numbers:", numberItems.map((n) => ({ s: n.str, right: n.x + n.width })));
      continue;
    }


    const firstNumX = Math.min(...numberItems.map((n) => n.x));
    const description = row.items
      .filter((it) => it.x > classItem.x + classItem.width - 0.1 && it.x < firstNumX)
      .map((it) => it.str.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    const values = picked.map((p) => parseBrlNumber(p!.str));
    const variations: (number | null)[] = [null];
    for (let i = 1; i < values.length; i++) {
      const base = Math.abs(values[i - 1]);
      const pct = base === 0
        ? (values[i] === 0 ? 0 : Infinity)
        : ((values[i] - values[i - 1]) / base) * 100;
      variations.push(pct);
    }
    const finiteVars = variations
      .slice(1)
      .filter((v): v is number => v !== null && Number.isFinite(v))
      .map((v) => Math.abs(v));
    const avgVariation = finiteVars.length
      ? finiteVars.reduce((a, b) => a + b, 0) / finiteVars.length
      : 0;
    const hasDivergence = variations.some(
      (v) => v !== null && Number.isFinite(v) && Math.abs(v) > 30,
    );

    // "Código" column: last plain integer item to the left of the classification
    let code = "";
    {
      const lefts = row.items
        .filter((it) => it.x + it.width <= classItem!.x + 0.5)
        .sort((a, b) => b.x - a.x);
      for (const it of lefts) {
        const t = it.str.trim();
        if (/^\d{1,8}$/.test(t)) {
          code = t;
          break;
        }
      }
    }

    seen.add(classification);
    out.push({
      code,
      classification,
      description,
      values,
      variations,
      avgVariation,
      hasDivergence,
    });
  }

  return { headers, rows: out, companyName: extractCompanyName(rows) };
}

// ---------- Functionality 2: Inverted balance ----------

export type AccountRow = {
  code: string;
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
    // "Código" column: last plain integer token before the classification
    let code = "";
    for (let i = classIdx - 1; i >= 0; i--) {
      const t = row.tokens[i].trim();
      if (/^\d{1,8}$/.test(t)) {
        code = t;
        break;
      }
    }
    const nums = row.tokens.filter(isNumberToken);
    if (nums.length === 0) continue;
    const last = nums[nums.length - 1];
    const natureza = /D$/i.test(last) ? "D" : /C$/i.test(last) ? "C" : null;
    const firstNumIdx = row.tokens.findIndex(isNumberToken);
    const description = row.tokens.slice(classIdx + 1, firstNumIdx).join(" ");
    out.push({
      code,
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
