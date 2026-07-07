import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ArrowLeft, Download } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useServerFn } from "@tanstack/react-start";
import { UploadArea } from "./UploadArea";
import {
  extractAllFifthLevelRows,
  extractRows,
  formatBRL,
  type AllClassificationsResult,
} from "@/lib/pdf-parser";
import { saveAnalysis } from "@/lib/analyses.functions";

type Props = { onBack: () => void };

const THRESHOLD = 30;

type State =
  | { kind: "idle" }
  | { kind: "processing" }
  | { kind: "error"; message: string }
  | { kind: "done"; result: AllClassificationsResult; fileName: string };

export function CompareLaunches({ onBack }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const persist = useServerFn(saveAnalysis);
  const persistedFor = useRef<string | null>(null);

  useEffect(() => {
    if (state.kind !== "done") return;
    const key = `${state.fileName}::${state.result.companyName}::${state.result.rows.length}`;
    if (persistedFor.current === key) return;
    persistedFor.current = key;
    const above = state.result.rows.filter((r) => r.hasDivergence);
    const avg =
      state.result.rows.length === 0
        ? 0
        : state.result.rows.reduce((s, r) => s + (Number.isFinite(r.avgVariation) ? r.avgVariation : 0), 0) /
          state.result.rows.length;
    const top = [...above]
      .sort((a, b) => Math.abs(b.avgVariation) - Math.abs(a.avgVariation))
      .slice(0, 10)
      .map((r) => ({
        classification: r.classification,
        description: r.description ?? "",
        avgVariation: Number.isFinite(r.avgVariation) ? r.avgVariation : 0,
      }));
    persist({
      data: {
        fileName: state.fileName,
        clientName: state.result.companyName,
        months: state.result.headers,
        threshold: THRESHOLD,
        totalClassifications: state.result.rows.length,
        aboveLimitCount: above.length,
        avgVariation: Number(avg.toFixed(4)),
        topClassifications: top,
      },
    }).catch((err) => {
      console.error("[analyses] save failed", err);
    });
  }, [state, persist]);

  async function process(f: File) {
    setState({ kind: "processing" });
    try {
      const parsedRows = await extractRows(f);
      const result = extractAllFifthLevelRows(parsedRows);
      if (!result) {
        setState({
          kind: "error",
          message:
            "Não foi possível identificar a estrutura esperada no PDF. Verifique se o arquivo corresponde ao tipo de análise selecionado.",
        });
        return;
      }
      if (result.rows.length === 0) {
        setState({
          kind: "error",
          message: "Nenhuma classificação de 5º nível (x.x.x.xx.xxx) foi encontrada no relatório.",
        });
        return;
      }
      if (!result.companyName) {
        setState({
          kind: "error",
          message: 'Não foi possível localizar o nome da empresa no PDF (campo "Empresa:").',
        });
        return;
      }
      setState({ kind: "done", result, fileName: f.name });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "Erro ao processar o PDF.",
      });
    }
  }


  function handleFile(f: File) {
    setFile(f);
    void process(f);
  }

  function clear() {
    setFile(null);
    setState({ kind: "idle" });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          Análise
        </span>
      </div>

      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Comparar Lançamentos Contábeis
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Analisa todas as classificações de 5º nível (x.x.x.xx.xxx) do relatório
          e destaca variações superiores a {THRESHOLD}% em relação ao mês anterior.
          A coluna "Saldo Acumulado", quando presente, é ignorada.
        </p>
      </div>

      <UploadArea
        file={file}
        onFile={handleFile}
        onClear={clear}
        disabled={state.kind === "processing"}
      />

      {state.kind === "processing" && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin text-accent-foreground" />
          Processando arquivo...
        </div>
      )}

      {state.kind === "error" && <ErrorCard message={state.message} />}

      {state.kind === "done" && <ResultTable result={state.result} fileName={state.fileName} />}
    </div>
  );
}

function formatPct(p: number | null): string {
  if (p === null) return "—";
  if (!Number.isFinite(p)) return "∞";
  return `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`;
}

function ResultTable({ result, fileName }: { result: AllClassificationsResult; fileName: string }) {
  const divergentCount = result.rows.filter((r) => r.hasDivergence).length;

  function exportPdf() {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 8;

    doc.setFontSize(14);
    doc.text("Comparativo de Lançamentos Contábeis", margin, 12);
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(`Arquivo: ${fileName}`, margin, 17);
    doc.text(
      `Limite de variação: ${THRESHOLD}% • ${divergentCount} de ${result.rows.length} classificações acima do limite`,
      margin,
      21,
    );
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, pageWidth - margin, 21, {
      align: "right",
    });

    const head = [
      [
        "Classificação",
        "Descrição",
        ...result.headers,
        "Média Var.",
      ],
    ];

    const body = result.rows.map((r) => {
      const valueCells = r.values.map((v, i) => {
        const pct = r.variations[i];
        const pctStr = pct === null ? "" : Number.isFinite(pct) ? `\n(${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)` : "\n(∞)";
        return { content: `${formatBRL(v)}${pctStr}`, styles: {} as Record<string, unknown> };
      });
      return [
        r.classification,
        r.description || "—",
        ...valueCells,
        `${r.avgVariation.toFixed(2)}%`,
      ];
    });

    autoTable(doc, {
      startY: 25,
      head,
      body,
      margin: { left: margin, right: margin, top: 25, bottom: 8 },
      styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak" },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold", fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 26, font: "courier", fontSize: 7 },
        1: { cellWidth: 55 },
      },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const row = result.rows[data.row.index];
        if (!row) return;
        const valueStart = 2;
        const valueEnd = valueStart + row.values.length - 1;
        if (data.column.index >= valueStart && data.column.index <= valueEnd) {
          const i = data.column.index - valueStart;
          const pct = row.variations[i];
          data.cell.styles.halign = "right";
          if (pct !== null && Number.isFinite(pct) && Math.abs(pct) > THRESHOLD) {
            data.cell.styles.fillColor = [254, 243, 199];
            data.cell.styles.textColor = [120, 53, 15];
            data.cell.styles.fontStyle = "bold";
          }
        }
        if (data.column.index === valueEnd + 1) {
          data.cell.styles.halign = "right";
          if (row.hasDivergence) {
            data.cell.styles.textColor = [120, 53, 15];
            data.cell.styles.fontStyle = "bold";
          }
        }
      },
      didDrawPage: () => {
        const pageCount = doc.getNumberOfPages();
        const pageCurrent = doc.getCurrentPageInfo().pageNumber;
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(
          `Página ${pageCurrent} de ${pageCount}`,
          pageWidth - margin,
          doc.internal.pageSize.getHeight() - 3,
          { align: "right" },
        );
      },
    });

    const base = fileName.replace(/\.pdf$/i, "");
    doc.save(`${base} - Comparativo.pdf`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
        {divergentCount > 0 ? (
          <>
            <AlertTriangle className="h-5 w-5 text-warning-foreground" />
            <p className="text-sm text-foreground">
              <span className="font-semibold">{divergentCount}</span> de{" "}
              <span className="font-semibold">{result.rows.length}</span> classificações
              apresentaram variação superior a {THRESHOLD}% em relação ao mês anterior.
            </p>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-5 w-5 text-success" />
            <p className="text-sm text-foreground">
              Nenhuma variação acima de {THRESHOLD}% entre meses para as{" "}
              {result.rows.length} classificações analisadas.
            </p>
          </>
        )}
        <button
          onClick={exportPdf}
          className="ml-auto inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Download className="h-3.5 w-3.5" />
          Exportar PDF
        </button>
      </div>

      <DraggableTable result={result} />
    </div>
  );
}

function DraggableTable({ result }: { result: AllClassificationsResult }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ startX: number; startScroll: number; active: boolean }>({
    startX: 0,
    startScroll: 0,
    active: false,
  });
  const [dragging, setDragging] = useState(false);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const el = scrollerRef.current;
    if (!el) return;
    // Don't hijack clicks on interactive children
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, select, textarea")) return;
    dragState.current = {
      startX: e.clientX,
      startScroll: el.scrollLeft,
      active: true,
    };
    el.setPointerCapture(e.pointerId);
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragState.current.active) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollLeft = dragState.current.startScroll - (e.clientX - dragState.current.startX);
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragState.current.active) return;
    dragState.current.active = false;
    setDragging(false);
    const el = scrollerRef.current;
    if (el && el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  }

  return (
    <div
      ref={scrollerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={`overflow-x-auto rounded-lg border border-border bg-card shadow-sm select-none ${
        dragging ? "cursor-grabbing" : "cursor-grab"
      }`}
    >
      <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-30 w-[140px] min-w-[140px] bg-card px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-r border-border">
              Classificação
            </th>
            <th className="sticky left-[140px] z-30 w-[260px] min-w-[260px] bg-card px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-r border-border">
              Descrição
            </th>
            {result.headers.map((h) => (
              <th
                key={h}
                className="bg-muted/40 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border"
              >
                {h}
              </th>
            ))}
            <th className="bg-muted/40 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
              Média de Variação
            </th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((r) => (
            <tr key={r.classification}>
              <td className="sticky left-0 z-20 w-[140px] min-w-[140px] bg-card px-4 py-3 font-mono text-xs text-foreground border-b border-r border-border">
                {r.classification}
              </td>
              <td className="sticky left-[140px] z-20 w-[260px] min-w-[260px] bg-card px-4 py-3 text-xs text-muted-foreground border-b border-r border-border">
                {r.description || "—"}
              </td>

              {r.values.map((v, i) => {
                const pct = r.variations[i];
                const divergent =
                  pct !== null && Number.isFinite(pct) && Math.abs(pct) > THRESHOLD;
                return (
                  <td
                    key={i}
                    className={`px-4 py-3 text-right tabular-nums border-b border-border ${
                      divergent
                        ? "bg-warning/20 text-warning-foreground font-semibold"
                        : "text-foreground"
                    }`}
                    title={pct !== null ? `Variação: ${formatPct(pct)}` : undefined}
                  >
                    <div>{formatBRL(v)}</div>
                    {pct !== null && (
                      <div
                        className={`text-[10px] ${
                          divergent ? "text-warning-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {formatPct(pct)}
                      </div>
                    )}
                  </td>
                );
              })}
              <td
                className={`px-4 py-3 text-right tabular-nums border-b border-border ${
                  r.hasDivergence
                    ? "text-warning-foreground font-semibold"
                    : "text-foreground"
                }`}
              >
                {r.avgVariation.toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-lg border-l-4 border-destructive bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
        <p className="text-sm text-foreground">{message}</p>
      </div>
    </div>
  );
}
