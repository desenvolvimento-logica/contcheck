import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { listAnalyses } from "@/lib/analyses.functions";
import { useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const { data: me, isLoading } = useCurrentUser();
  const list = useServerFn(listAnalyses);
  const [days, setDays] = useState(30);

  if (!isLoading && me && !["lider", "coordenador", "admin"].includes(me.role)) {
    navigate({ to: "/" });
  }

  const q = useQuery({
    queryKey: ["analyses"],
    queryFn: () => list(),
    enabled: !!me && ["lider", "coordenador", "admin"].includes(me.role),
  });

  const stats = useMemo(() => {
    const all = q.data ?? [];
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const filtered = all.filter((a) => new Date(a.created_at).getTime() >= since);
    const totalAnalyses = filtered.length;
    const totalAbove = filtered.reduce((s, a) => s + (a.above_limit_count ?? 0), 0);
    const avgVar =
      filtered.length === 0
        ? 0
        : filtered.reduce((s, a) => s + Number(a.avg_variation ?? 0), 0) / filtered.length;

    const byUser = new Map<string, number>();
    filtered.forEach((a) => {
      const k = a.author.nome || a.author.email;
      byUser.set(k, (byUser.get(k) ?? 0) + 1);
    });
    const topUsers = Array.from(byUser.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const byClass = new Map<string, { variations: number[]; description: string }>();
    filtered.forEach((a) => {
      const arr = (a.top_classifications ?? []) as {
        classification: string;
        description: string;
        avgVariation: number;
      }[];
      arr.forEach((c) => {
        const entry = byClass.get(c.classification) ?? { variations: [], description: c.description };
        entry.variations.push(Number(c.avgVariation));
        byClass.set(c.classification, entry);
      });
    });
    const topClasses = Array.from(byClass.entries())
      .map(([classification, v]) => ({
        classification,
        description: v.description,
        avgVariation: v.variations.reduce((s, n) => s + n, 0) / v.variations.length,
      }))
      .sort((a, b) => Math.abs(b.avgVariation) - Math.abs(a.avgVariation))
      .slice(0, 10);

    return { totalAnalyses, totalAbove, avgVar, topUsers, topClasses };
  }, [q.data, days]);

  if (!me || !["lider", "coordenador", "admin"].includes(me.role)) {
    return <p className="text-sm text-muted-foreground">Verificando permissão...</p>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Indicadores das análises realizadas pela equipe.
          </p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
          <option value={365}>Últimos 12 meses</option>
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Análises no período" value={stats.totalAnalyses.toString()} />
        <Kpi
          label="Classificações acima do limite"
          value={stats.totalAbove.toString()}
          accent={stats.totalAbove > 0}
        />
        <Kpi label="Variação média" value={`${stats.avgVar.toFixed(2)}%`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Análises por usuário">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stats.topUsers}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Variação média por classificação (top 10)">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stats.topClasses}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="classification" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={70} />
              <YAxis tick={{ fontSize: 11 }} unit="%" />
              <Tooltip />
              <Bar dataKey="avgVariation" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={`mt-2 text-3xl font-semibold ${
          accent ? "text-warning-foreground" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}
