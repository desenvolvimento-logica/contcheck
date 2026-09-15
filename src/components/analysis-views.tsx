import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatBRL } from "@/lib/pdf-parser";

// Presentational pieces shared between the live analysis screens and the
// saved-analysis summary dialog, so both render the exact same layout.

export type CompareRowView = {
  code?: string;
  classification: string;
  description?: string;
  values: number[];
  variations: (number | null)[];
  avgVariation: number;
  hasDivergence: boolean;
};

export type InvertedAccountView = {
  code?: string;
  classification: string;
  description?: string;
  saldoAtualNum: number;
  natureza?: "D" | "C" | null;
  expected?: "D" | "C";
};

export function formatPct(p: number | null): string {
  if (p === null) return "—";
  if (!Number.isFinite(p)) return "∞";
  return `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`;
}

export function DraggableTable({
  headers,
  rows,
  threshold,
}: {
  headers: string[];
  rows: CompareRowView[];
  threshold: number;
}) {
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
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, select, textarea")) return;
    dragState.current = { startX: e.clientX, startScroll: el.scrollLeft, active: true };
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
              Código
            </th>
            <th className="sticky left-[140px] z-30 w-[260px] min-w-[260px] bg-card px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-r border-border">
              Descrição
            </th>
            {headers.map((h) => (
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
          {rows.map((r) => (
            <tr key={r.classification}>
              <td className="sticky left-0 z-20 w-[140px] min-w-[140px] bg-card px-4 py-3 font-mono text-xs text-foreground border-b border-r border-border">
                {r.code || r.classification}
              </td>
              <td className="sticky left-[140px] z-20 w-[260px] min-w-[260px] bg-card px-4 py-3 text-xs text-muted-foreground border-b border-r border-border">
                {r.description || "—"}
              </td>

              {r.values.map((v, i) => {
                const pct = r.variations[i] ?? null;
                const divergent =
                  pct !== null && Number.isFinite(pct) && Math.abs(pct) > threshold;
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
                  r.hasDivergence ? "text-warning-foreground font-semibold" : "text-foreground"
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

export function Section({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-3 border-b border-border pb-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          {count}
        </span>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export function EmptyCard({ message }: { message: string }) {
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
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 text-xs font-medium text-foreground ${mono ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

export function InvertedSections({
  inverted,
  lowBalance,
  invertedAction,
  lowBalanceAction,
}: {
  inverted: InvertedAccountView[];
  lowBalance: InvertedAccountView[];
  invertedAction?: React.ReactNode;
  lowBalanceAction?: React.ReactNode;
}) {
  return (
    <div className="space-y-8">
      <Section
        title="Saldos com natureza invertida"
        count={inverted.length}
        action={inverted.length > 0 ? invertedAction : null}
      >
        {inverted.length === 0 ? (
          <EmptyCard message="Nenhum saldo invertido foi encontrado." />
        ) : (
          <div className="space-y-3">
            {inverted.map((a, i) => (
              <div
                key={`${a.classification}-${i}`}
                className="rounded-lg border-l-4 border-warning bg-card p-5 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-warning-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      Divergência encontrada: a classificação{" "}
                      <span className="font-mono">{a.classification}</span> deveria terminar
                      com saldo {a.expected}, mas o Saldo Atual encontrado foi{" "}
                      {formatBRL(a.saldoAtualNum)} {a.natureza}.
                    </p>
                    {a.description && (
                      <p className="mt-1 text-xs text-muted-foreground">{a.description}</p>
                    )}
                    <dl className="mt-3 grid grid-cols-3 gap-3 text-xs">
                      <Field label="Código" value={a.code || "—"} mono />
                      <Field
                        label="Saldo atual"
                        value={`${formatBRL(a.saldoAtualNum)} ${a.natureza ?? ""}`}
                      />
                      <Field label="Regra esperada" value={`Saldo ${a.expected ?? "—"}`} />
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
        count={lowBalance.length}
        action={lowBalance.length > 0 ? lowBalanceAction : null}
      >
        {lowBalance.length === 0 ? (
          <EmptyCard message="Nenhum saldo atual entre R$ 0,01 e R$ 9,99 foi encontrado." />
        ) : (
          <div className="space-y-3">
            {lowBalance.map((a, i) => (
              <div
                key={`${a.classification}-${i}`}
                className="rounded-lg border-l-4 border-warning bg-card p-5 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-warning-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      Atenção: saldo atual baixo identificado. Código:{" "}
                      <span className="font-mono">{a.code || a.classification}</span>. Saldo
                      Atual: {formatBRL(a.saldoAtualNum)} {a.natureza ?? ""}.
                    </p>
                    {a.description && (
                      <p className="mt-1 text-xs text-muted-foreground">{a.description}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

export function CompareSummaryHeader({
  divergentCount,
  total,
  threshold,
  action,
}: {
  divergentCount: number;
  total: number;
  threshold: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
      {divergentCount > 0 ? (
        <>
          <AlertTriangle className="h-5 w-5 text-warning-foreground" />
          <p className="text-sm text-foreground">
            <span className="font-semibold">{divergentCount}</span> de{" "}
            <span className="font-semibold">{total}</span> classificações apresentaram
            variação superior a {threshold}% em relação ao mês anterior.
          </p>
        </>
      ) : (
        <>
          <CheckCircle2 className="h-5 w-5 text-success" />
          <p className="text-sm text-foreground">
            Nenhuma variação acima de {threshold}% entre meses para as {total} classificações
            analisadas.
          </p>
        </>
      )}
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}
