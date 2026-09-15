import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download } from "lucide-react";
import * as XLSX from "xlsx";
import { listAnalyses } from "@/lib/analyses.functions";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  CompareSummaryHeader,
  DraggableTable,
  InvertedSections,
  type CompareRowView,
  type InvertedAccountView,
} from "@/components/analysis-views";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/team-analyses")({
  component: TeamAnalysesPage,
});

type AnalysisRow = Awaited<ReturnType<typeof listAnalyses>>[number];

const PAGE_SIZE = 20;

const TYPE_LABELS: Record<string, string> = {
  compare_launches: "Lançamentos contábeis",
  inverted_balance: "Saldo invertido",
};

function typeLabel(t: string) {
  return TYPE_LABELS[t] ?? t;
}

function TeamAnalysesPage() {
  const { data: me } = useCurrentUser();
  const list = useServerFn(listAnalyses);
  const q = useQuery({
    queryKey: ["analyses"],
    queryFn: () => list(),
  });
  const [authorFilter, setAuthorFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [since, setSince] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AnalysisRow | null>(null);

  const authors = useMemo(() => {
    const s = new Set<string>();
    (q.data ?? []).forEach((a) => s.add(a.author.email));
    return Array.from(s).sort();
  }, [q.data]);

  const rows = useMemo(() => {
    return (q.data ?? []).filter((a) => {
      if (authorFilter && a.author.email !== authorFilter) return false;
      if (typeFilter && a.analysis_type !== typeFilter) return false;
      if (since && new Date(a.created_at) < new Date(since)) return false;
      return true;
    });
  }, [q.data, authorFilter, typeFilter, since]);

  useEffect(() => {
    setPage(1);
  }, [authorFilter, typeFilter, since]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const isLeader = me?.role === "lider" || me?.role === "coordenador" || me?.role === "admin";

  function exportReport() {
    const aoa: (string | number)[][] = [
      ["Relatório de análises"],
      [`Gerado em ${new Date().toLocaleString("pt-BR")}`],
      [`${rows.length} análise(s)`],
      [],
      ["Colaborador", "Data da análise", "Cliente", "Tipo da análise"],
      ...rows.map((a) => [
        a.author.nome || a.author.email,
        new Date(a.created_at).toLocaleString("pt-BR"),
        a.client_name || "—",
        typeLabel(a.analysis_type),
      ]),
    ];
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    sheet["!cols"] = [{ wch: 32 }, { wch: 22 }, { wch: 38 }, { wch: 26 }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Análises");
    XLSX.writeFile(book, "Relatorio de Analises.xlsx");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          {isLeader ? "Análises da equipe" : "Minhas análises"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isLeader
            ? "Visualize as análises realizadas pelos membros sob sua responsabilidade. Clique em uma linha para ver o resumo."
            : "Histórico das análises que você realizou. Clique em uma linha para ver o resumo."}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
        <div>
          <label className="block text-xs font-medium text-foreground">Autor</label>
          <select
            value={authorFilter}
            onChange={(e) => setAuthorFilter(e.target.value)}
            className="mt-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="">Todos</option>
            {authors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground">Tipo de análise</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="mt-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="">Todas</option>
            <option value="compare_launches">Lançamentos contábeis</option>
            <option value="inverted_balance">Saldo invertido</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground">A partir de</label>
          <input
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            className="mt-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{rows.length} análise(s)</span>
          <button
            onClick={exportReport}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar relatório
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Data</th>
              <th className="px-4 py-3 text-left">Autor</th>
              <th className="px-4 py-3 text-left">Perfil</th>
              <th className="px-4 py-3 text-left">Tipo</th>
              <th className="px-4 py-3 text-left">Cliente</th>
              <th className="px-4 py-3 text-left">Arquivo</th>
              <th className="px-4 py-3 text-left">Meses</th>
              <th className="px-4 py-3 text-right">Limite</th>
              <th className="px-4 py-3 text-right">Classif.</th>
              <th className="px-4 py-3 text-right">Acima do limite</th>
              <th className="px-4 py-3 text-right">Variação média</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">
                  Carregando...
                </td>
              </tr>
            )}
            {!q.isLoading && q.isError && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-sm text-destructive">
                  {String((q.error as Error)?.message ?? "").includes("PASSWORD_CHANGE_REQUIRED")
                    ? "Defina sua nova senha para liberar o histórico da equipe."
                    : "Não foi possível carregar o histórico. Atualize a página e tente novamente."}
                </td>
              </tr>
            )}
            {!q.isLoading && !q.isError && rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhuma análise encontrada.
                </td>
              </tr>
            )}
            {pageRows.map((a) => (
              <tr
                key={a.id}
                onClick={() => setSelected(a)}
                className="cursor-pointer border-t border-border transition-colors hover:bg-muted/40"
              >
                <td className="px-4 py-2 whitespace-nowrap">
                  {new Date(a.created_at).toLocaleString("pt-BR")}
                </td>
                <td className="px-4 py-2">{a.author.nome || a.author.email}</td>
                <td className="px-4 py-2 capitalize">{a.role}</td>
                <td className="px-4 py-2 whitespace-nowrap">{typeLabel(a.analysis_type)}</td>
                <td className="px-4 py-2">{a.client_name || "—"}</td>
                <td className="px-4 py-2">{a.file_name}</td>
                <td className="px-4 py-2 text-xs">{(a.months ?? []).join(" / ")}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {a.analysis_type === "inverted_balance"
                    ? "—"
                    : `${Number(a.threshold).toFixed(0)}%`}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{a.total_classifications}</td>
                <td
                  className={`px-4 py-2 text-right tabular-nums ${
                    a.above_limit_count > 0 ? "text-warning-foreground font-semibold" : ""
                  }`}
                >
                  {a.above_limit_count}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {a.analysis_type === "inverted_balance"
                    ? "—"
                    : `${Number(a.avg_variation).toFixed(2)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            Página {currentPage} de {totalPages} • mostrando {pageRows.length} de {rows.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>
      )}

      <AnalysisDetailDialog analysis={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function AnalysisDetailDialog({
  analysis,
  onClose,
}: {
  analysis: AnalysisRow | null;
  onClose: () => void;
}) {
  const details = (analysis?.details ?? {}) as {
    headers?: string[];
    threshold?: number;
    rows?: CompareRowView[];
    inverted?: InvertedAccountView[];
    lowBalance?: InvertedAccountView[];
  };
  const isInverted = analysis?.analysis_type === "inverted_balance";
  const compareRows = details.rows ?? [];
  const top = (analysis?.top_classifications ?? []) as Array<{
    classification: string;
    description?: string;
    avgVariation: number;
  }>;

  return (
    <Dialog open={!!analysis} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isInverted ? "Análise de saldo invertido" : "Comparativo de lançamentos contábeis"}
          </DialogTitle>
          <DialogDescription>
            {analysis
              ? `${analysis.author.nome || analysis.author.email} • ${new Date(
                  analysis.created_at,
                ).toLocaleString("pt-BR")}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {analysis && (
          <div className="space-y-5 text-sm">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <dt className="text-muted-foreground">Cliente</dt>
              <dd className="text-right font-medium">{analysis.client_name || "—"}</dd>

              <dt className="text-muted-foreground">Arquivo</dt>
              <dd className="text-right font-medium break-all">{analysis.file_name}</dd>

              {!isInverted && (
                <>
                  <dt className="text-muted-foreground">Meses comparados</dt>
                  <dd className="text-right">{(analysis.months ?? []).join(" / ")}</dd>
                </>
              )}
            </dl>

            {isInverted ? (
              <InvertedSections
                inverted={details.inverted ?? []}
                lowBalance={details.lowBalance ?? []}
              />
            ) : compareRows.length > 0 ? (
              <div className="space-y-4">
                <CompareSummaryHeader
                  divergentCount={analysis.above_limit_count}
                  total={analysis.total_classifications}
                  threshold={details.threshold ?? Number(analysis.threshold)}
                />
                <DraggableTable
                  headers={details.headers ?? analysis.months ?? []}
                  rows={compareRows}
                  threshold={details.threshold ?? Number(analysis.threshold)}
                />
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Esta análise foi salva antes do detalhamento completo. Veja abaixo o resumo
                  disponível.
                </p>
                {top.length > 0 && (
                  <div className="max-h-64 overflow-y-auto rounded-md border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">Código</th>
                          <th className="px-3 py-2 text-left">Descrição</th>
                          <th className="px-3 py-2 text-right">Variação média</th>
                        </tr>
                      </thead>
                      <tbody>
                        {top.map((t, i) => (
                          <tr key={`${t.classification}-${i}`} className="border-t border-border">
                            <td className="px-3 py-1.5 font-mono">{t.classification}</td>
                            <td className="px-3 py-1.5">{t.description}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {Number(t.avgVariation).toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
