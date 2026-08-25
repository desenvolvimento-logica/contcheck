import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ArrowLeft, Download } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { UploadArea } from "./UploadArea";
import {
  analyzeInverted,
  extractAccountRows,
  extractRows,
  formatBRL,
  type AccountRow,
  type InvertedResult,
} from "@/lib/pdf-parser";


type Props = { onBack: () => void };

type State =
  | { kind: "idle" }
  | { kind: "processing" }
  | { kind: "error"; message: string }
  | { kind: "done"; result: InvertedResult };

export function InvertedBalance({ onBack }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });

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
      const result = analyzeInverted(accounts);
      setState({ kind: "done", result });
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

function buildPdf(
  title: string,
  fileName: string,
  head: string[],
  body: string[][],
  saveAs: string,
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 8;

  doc.setFontSize(14);
  doc.text(title, margin, 12);
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(`Arquivo: ${fileName}`, margin, 17);
  doc.text(`${body.length} registro(s)`, margin, 21);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, pageWidth - margin, 21, {
    align: "right",
  });

  autoTable(doc, {
    startY: 25,
    head: [head],
    body,
    margin: { left: margin, right: margin, top: 25, bottom: 8 },
    styles: { fontSize: 8, cellPadding: 1.8, overflow: "linebreak" },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold", fontSize: 8 },
    columnStyles: { 0: { cellWidth: 30, font: "courier", fontSize: 8 } },
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

  doc.save(saveAs);
}

function ResultView({ result, fileName }: { result: InvertedResult; fileName: string }) {
  const base = fileName.replace(/\.pdf$/i, "");

  function exportInverted() {
    buildPdf(
      "Saldos com natureza invertida",
      fileName,
      ["Classificação", "Descrição", "Saldo atual", "Natureza", "Esperado"],
      result.inverted.map((a) => [
        a.classification,
        a.description || "—",
        formatBRL(a.saldoAtualNum),
        a.natureza ?? "—",
        a.expected,
      ]),
      `${base} - Saldos Invertidos.pdf`,
    );
  }

  function exportLowBalance() {
    buildPdf(
      "Saldos atuais entre R$ 0,01 e R$ 9,99",
      fileName,
      ["Classificação", "Descrição", "Saldo atual", "Natureza"],
      result.lowBalance.map((a) => [
        a.classification,
        a.description || "—",
        formatBRL(a.saldoAtualNum),
        a.natureza ?? "—",
      ]),
      `${base} - Saldos Baixos.pdf`,
    );
  }

  return (
    <div className="space-y-8">
      <Section
        title="Saldos com natureza invertida"
        count={result.inverted.length}
        action={
          result.inverted.length > 0 ? (
            <ExportButton onClick={exportInverted} />
          ) : null
        }
      >
        {result.inverted.length === 0 ? (
          <EmptyCard message="Nenhum saldo invertido foi encontrado." />
        ) : (

          <div className="space-y-3">
            {result.inverted.map((a, i) => (
              <div
                key={`${a.classification}-${i}`}
                className="rounded-lg border-l-4 border-warning bg-card p-5 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-warning-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      Divergência encontrada: a classificação{" "}
                      <span className="font-mono">{a.classification}</span> deveria
                      terminar com saldo {a.expected}, mas o Saldo Atual encontrado
                      foi {formatBRL(a.saldoAtualNum)} {a.natureza}.
                    </p>
                    {a.description && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {a.description}
                      </p>
                    )}
                    <dl className="mt-3 grid grid-cols-3 gap-3 text-xs">
                      <Field label="Classificação" value={a.classification} mono />
                      <Field
                        label="Saldo atual"
                        value={`${formatBRL(a.saldoAtualNum)} ${a.natureza ?? ""}`}
                      />
                      <Field label="Regra esperada" value={`Saldo ${a.expected}`} />
                    </dl>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Saldos atuais entre R$ 0,01 e R$ 9,99"
        count={result.lowBalance.length}
        action={
          result.lowBalance.length > 0 ? (
            <ExportButton onClick={exportLowBalance} />
          ) : null
        }
      >

        {result.lowBalance.length === 0 ? (
          <EmptyCard message="Nenhum saldo atual entre R$ 0,01 e R$ 9,99 foi encontrado." />
        ) : (
          <div className="space-y-3">
            {result.lowBalance.map((a, i) => (
              <LowBalanceCard key={`${a.classification}-${i}`} account={a} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function LowBalanceCard({ account }: { account: AccountRow }) {
  return (
    <div className="rounded-lg border-l-4 border-warning bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 text-warning-foreground" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">
            Atenção: saldo atual baixo identificado. Classificação:{" "}
            <span className="font-mono">{account.classification}</span>. Saldo Atual:{" "}
            {formatBRL(account.saldoAtualNum)} {account.natureza ?? ""}.
          </p>
          {account.description && (
            <p className="mt-1 text-xs text-muted-foreground">{account.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between border-b border-border pb-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          {count}
        </span>
      </div>
      {children}
    </section>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-5 shadow-sm">
      <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
      <p className="text-sm text-foreground">{message}</p>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className={`mt-0.5 text-xs font-medium text-foreground ${mono ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
