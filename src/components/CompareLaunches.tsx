import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ArrowLeft } from "lucide-react";
import { UploadArea } from "./UploadArea";
import {
  compareVariation,
  extractRows,
  findClassificationRow,
  formatBRL,
  type CompareResult,
  type Variation,
} from "@/lib/pdf-parser";

type Props = { onBack: () => void };

type State =
  | { kind: "idle" }
  | { kind: "processing" }
  | { kind: "error"; message: string }
  | {
      kind: "done";
      result: CompareResult;
      v1: Variation;
      v2: Variation;
    };

export function CompareLaunches({ onBack }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [classification, setClassification] = useState("3.1.1.02.002");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function process(f: File) {
    setState({ kind: "processing" });
    try {
      const rows = await extractRows(f);
      const result = findClassificationRow(rows, classification.trim());
      if (!result) {
        setState({
          kind: "error",
          message:
            "Não foi possível identificar a estrutura esperada no PDF. Verifique se o arquivo corresponde ao tipo de análise selecionado e se a classificação informada existe no relatório.",
        });
        return;
      }
      const v1 = compareVariation(`${result.headers[0]} → ${result.headers[1]}`, result.m1, result.m2);
      const v2 = compareVariation(`${result.headers[1]} → ${result.headers[2]}`, result.m2, result.m3);
      setState({ kind: "done", result, v1, v2 });
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
          Comparar Lançamentos Contábeis
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Identifica variações superiores a 30% entre Mês 1, Mês 2 e Mês 3 para a
          classificação informada.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <label className="block text-sm font-medium text-foreground">
          Classificação
        </label>
        <input
          type="text"
          value={classification}
          onChange={(e) => setClassification(e.target.value)}
          placeholder="3.1.1.02.002"
          className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-ring/40"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Padrão: 3.1.1.02.002 — você pode alterar antes ou depois do upload e
          reenviar o arquivo.
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
        <ErrorCard message={state.message} />
      )}

      {state.kind === "done" && (
        <ResultView result={state.result} v1={state.v1} v2={state.v2} />
      )}
    </div>
  );
}

function ResultView({
  result,
  v1,
  v2,
}: {
  result: CompareResult;
  v1: Variation;
  v2: Variation;
}) {
  const anyDiv = v1.divergent || v2.divergent;
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Resumo da análise
        </h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Classificação" value={result.classification} mono />
          <Stat label={result.headers[0]} value={formatBRL(result.m1)} />
          <Stat label={result.headers[1]} value={formatBRL(result.m2)} />
          <Stat label={result.headers[2]} value={formatBRL(result.m3)} />
        </dl>
        {result.description && (
          <p className="mt-4 text-xs text-muted-foreground">
            Descrição: {result.description}
          </p>
        )}
      </div>

      <VariationCard v={v1} />
      <VariationCard v={v2} />

      {!anyDiv && (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-5 shadow-sm">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
          <p className="text-sm text-foreground">
            Nenhuma divergência superior a 30% foi encontrada para a classificação
            analisada.
          </p>
        </div>
      )}
    </div>
  );
}

function VariationCard({ v }: { v: Variation }) {
  const pct = Number.isFinite(v.percent)
    ? `${v.percent >= 0 ? "+" : ""}${v.percent.toFixed(2)}%`
    : "—";
  if (v.divergent) {
    return (
      <div className="rounded-lg border-l-4 border-warning bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-warning-foreground" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">
              Atenção: variação de {pct} em {v.label}.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Diferença encontrada: {formatBRL(v.diff)}.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {formatBRL(v.previous)} → {formatBRL(v.current)}
            </p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
        <div>
          <p className="text-sm font-medium text-foreground">
            {v.label}: variação normal ({pct}).
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatBRL(v.previous)} → {formatBRL(v.current)} · diferença{" "}
            {formatBRL(v.diff)}
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`mt-1 text-sm font-semibold text-foreground ${mono ? "font-mono" : ""}`}
      >
        {value}
      </dd>
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
