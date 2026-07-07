import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAnalyses } from "@/lib/analyses.functions";
import { useCurrentUser } from "@/hooks/use-current-user";
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

function TeamAnalysesPage() {
  const { data: me } = useCurrentUser();
  const list = useServerFn(listAnalyses);
  const q = useQuery({
    queryKey: ["analyses"],
    queryFn: () => list(),
  });
  const [authorFilter, setAuthorFilter] = useState("");
  const [since, setSince] = useState("");
  const [selected, setSelected] = useState<AnalysisRow | null>(null);

  const authors = useMemo(() => {
    const s = new Set<string>();
    (q.data ?? []).forEach((a) => s.add(a.author.email));
    return Array.from(s).sort();
  }, [q.data]);

  const rows = useMemo(() => {
    return (q.data ?? []).filter((a) => {
      if (authorFilter && a.author.email !== authorFilter) return false;
      if (since && new Date(a.created_at) < new Date(since)) return false;
      return true;
    });
  }, [q.data, authorFilter, since]);

  const isLeader = me?.role === "lider" || me?.role === "coordenador" || me?.role === "admin";

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
          <label className="block text-xs font-medium text-foreground">A partir de</label>
          <input
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            className="mt-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
        </div>
        <div className="ml-auto text-xs text-muted-foreground">
          {rows.length} análise(s)
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Data</th>
              <th className="px-4 py-3 text-left">Autor</th>
              <th className="px-4 py-3 text-left">Perfil</th>
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
                <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                  Carregando...
                </td>
              </tr>
            )}
            {!q.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhuma análise encontrada.
                </td>
              </tr>
            )}
            {rows.map((a) => (
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
                <td className="px-4 py-2">{a.client_name || "—"}</td>
                <td className="px-4 py-2">{a.file_name}</td>
                <td className="px-4 py-2 text-xs">{(a.months ?? []).join(" / ")}</td>
                <td className="px-4 py-2 text-right tabular-nums">{Number(a.threshold).toFixed(0)}%</td>
                <td className="px-4 py-2 text-right tabular-nums">{a.total_classifications}</td>
                <td
                  className={`px-4 py-2 text-right tabular-nums ${
                    a.above_limit_count > 0 ? "text-warning-foreground font-semibold" : ""
                  }`}
                >
                  {a.above_limit_count}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {Number(a.avg_variation).toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
  const top = (analysis?.top_classifications ?? []) as Array<{
    classification: string;
    description?: string;
    avgVariation: number;
  }>;

  return (
    <Dialog open={!!analysis} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Resumo da análise</DialogTitle>
          <DialogDescription>
            {analysis
              ? `${analysis.author.nome || analysis.author.email} • ${new Date(
                  analysis.created_at,
                ).toLocaleString("pt-BR")}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {analysis && (
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <dt className="text-muted-foreground">Cliente</dt>
              <dd className="text-right font-medium">{analysis.client_name || "—"}</dd>

              <dt className="text-muted-foreground">Arquivo</dt>
              <dd className="text-right font-medium break-all">{analysis.file_name}</dd>

              <dt className="text-muted-foreground">Meses comparados</dt>
              <dd className="text-right">{(analysis.months ?? []).join(" / ")}</dd>

              <dt className="text-muted-foreground">Limite de variação</dt>
              <dd className="text-right tabular-nums">
                {Number(analysis.threshold).toFixed(0)}%
              </dd>

              <dt className="text-muted-foreground">Classificações analisadas</dt>
              <dd className="text-right tabular-nums">{analysis.total_classifications}</dd>

              <dt className="text-muted-foreground">Acima do limite</dt>
              <dd
                className={`text-right tabular-nums ${
                  analysis.above_limit_count > 0 ? "font-semibold text-warning-foreground" : ""
                }`}
              >
                {analysis.above_limit_count}
              </dd>

              <dt className="text-muted-foreground">Variação média</dt>
              <dd className="text-right tabular-nums">
                {Number(analysis.avg_variation).toFixed(2)}%
              </dd>
            </dl>

            {top.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-foreground">
                  Principais classificações acima do limite
                </h3>
                <div className="max-h-64 overflow-y-auto rounded-md border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Classificação</th>
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
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
