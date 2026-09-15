import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ArrowLeft, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { useServerFn } from "@tanstack/react-start";

import { UploadArea } from "./UploadArea";
import {
  analyzeInverted,
  extractAccountRows,
  extractCompanyName,
  extractRows,
  formatBRL,
  type AccountRow,
  type InvertedResult,
} from "@/lib/pdf-parser";
import { saveAnalysis } from "@/lib/analyses.functions";


type Props = { onBack: () => void };

type State =
  | { kind: "idle" }
  | { kind: "processing" }
  | { kind: "error"; message: string }
  | { kind: "done"; result: InvertedResult; fileName: string; companyName: string };

export function InvertedBalance({ onBack }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const persist = useServerFn(saveAnalysis);
  const persistedFor = useRef<string | null>(null);

  useEffect(() => {
    if (state.kind !== "done") return;
    const key = `${state.fileName}::${state.companyName}::${state.result.inverted.length}::${state.result.lowBalance.length}`;
    if (persistedFor.current === key) return;
    persistedFor.current = key;
    persist({
      data: {
        analysisType: "inverted_balance",
        fileName: state.fileName,
        clientName: state.companyName,
        months: [],
        threshold: 0,
        totalClassifications: state.result.inverted.length + state.result.lowBalance.length,
        aboveLimitCount: state.result.inverted.length,
        avgVariation: 0,
        topClassifications: [],
        details: {
          inverted: state.result.inverted.slice(0, 500),
          lowBalance: state.result.lowBalance.slice(0, 500),
        },
      },
    }).catch((err) => {
      console.error("[analyses] save failed", err);
    });
  }, [state, persist]);

  async function process(f: File) {
    setState({ kind: "processing" });
    try {
      const rows = await extractRows(f);
      const accounts = extractAccountRows(rows);
      if (accounts.length === 0) {
        setState({
          kind: "error",
          message:
            "Não foi possível identificar a estrutura esperada no PDF. Verifique se o arquivo corresponde ao tipo de análise selecionado.",
        });
        return;
      }
      const companyName = extractCompanyName(rows);
      if (!companyName) {
        setState({
          kind: "error",
          message: 'Não foi possível localizar o nome da empresa no PDF (campo "Empresa:").',
        });
        return;
      }
      const result = analyzeInverted(accounts);
      setState({ kind: "done", result, fileName: f.name, companyName });
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
    <div className="mx-auto max-w-4xl space-y-6">
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
          Analisar Saldo Invertido
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Valida a natureza do saldo conforme a classificação contábil e identifica
          saldos atuais entre R$ 0,01 e R$ 9,99.
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

      {state.kind === "error" && (
        <div className="rounded-lg border-l-4 border-destructive bg-card p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
            <p className="text-sm text-foreground">{state.message}</p>
          </div>
        </div>
      )}

      {state.kind === "done" && (
        <ResultView result={state.result} fileName={file?.name ?? "relatorio.pdf"} />
      )}
    </div>
  );
}

function buildXlsx(
  sheetName: string,
  title: string,
  fileName: string,
  head: string[],
  body: (string | number)[][],
  saveAs: string,
) {
  const aoa: (string | number)[][] = [
    [title],
    [`Arquivo: ${fileName}`],
    [`Gerado em ${new Date().toLocaleString("pt-BR")}`],
    [`${body.length} registro(s)`],
    [],
    head,
    ...body,
  ];

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = head.map((h, i) =>
    i === 1 ? { wch: 45 } : { wch: Math.max(16, h.length + 4) },
  );
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName);
  XLSX.writeFile(book, saveAs);
}

function ResultView({ result, fileName }: { result: InvertedResult; fileName: string }) {
  const base = fileName.replace(/\.pdf$/i, "");

  function exportInverted() {
    buildXlsx(
      "Saldos Invertidos",
      "Saldos com natureza invertida",
      fileName,
      ["Classificação", "Descrição", "Saldo atual", "Natureza", "Natureza esperada"],
      result.inverted.map((a) => [
        a.classification,
        a.description || "—",
        a.saldoAtualNum,
        a.natureza ?? "—",
        a.expected,
      ]),
      `${base} - Saldos Invertidos.xlsx`,
    );
  }

  function exportLowBalance() {
    buildXlsx(
      "Saldos Baixos",
      "Saldos atuais entre R$ 0,01 e R$ 9,99",
      fileName,
      ["Código", "Descrição", "Saldo atual", "Natureza"],
      result.lowBalance.map((a) => [
        a.code || a.classification,
        a.description || "—",
        a.saldoAtualNum,
        a.natureza ?? "—",
      ]),
      `${base} - Saldos Baixos.xlsx`,
    );
  }


  return (
    <InvertedSections
      inverted={result.inverted}
      lowBalance={result.lowBalance}
      invertedAction={<ExportButton onClick={exportInverted} />}
      lowBalanceAction={<ExportButton onClick={exportLowBalance} />}
    />
  );
}

function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <Download className="h-3.5 w-3.5" />
      Exportar Excel
    </button>
  );
}
