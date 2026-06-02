import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { GitCompareArrows, Scale, ArrowRight } from "lucide-react";
import { CompareLaunches } from "@/components/CompareLaunches";
import { InvertedBalance } from "@/components/InvertedBalance";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Análise de Relatórios Contábeis — Domínio" },
      {
        name: "description",
        content:
          "Compare lançamentos contábeis e identifique saldos invertidos a partir de relatórios PDF exportados do sistema Domínio.",
      },
      { property: "og:title", content: "Análise de Relatórios Contábeis — Domínio" },
      {
        property: "og:description",
        content:
          "Compare lançamentos contábeis e identifique saldos invertidos a partir de relatórios PDF exportados do sistema Domínio.",
      },
    ],
  }),
  component: Index,
});

type View = "home" | "compare" | "inverted";

function Index() {
  const [view, setView] = useState<View>("home");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-md bg-accent" aria-hidden />
            <span className="text-sm font-semibold tracking-tight text-foreground">
              Auditoria Contábil
            </span>
          </div>
          <span className="text-xs text-muted-foreground">Relatórios Domínio</span>
        </div>
      </header>

      <main className="px-6 py-10 sm:py-16">
        {view === "home" && <Home onSelect={setView} />}
        {view === "compare" && <CompareLaunches onBack={() => setView("home")} />}
        {view === "inverted" && <InvertedBalance onBack={() => setView("home")} />}
      </main>
    </div>
  );
}

function Home({ onSelect }: { onSelect: (v: View) => void }) {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="max-w-2xl">
        <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Análise contábil
        </span>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Análise de Relatórios Contábeis
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          Faça upload de relatórios em PDF exportados do sistema Domínio para
          comparar lançamentos contábeis ou identificar saldos com natureza
          invertida.
        </p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Card
          icon={<GitCompareArrows className="h-5 w-5" />}
          title="Comparar Lançamentos Contábeis"
          description="Identifica variações superiores a 30% entre Mês 1, Mês 2 e Mês 3 para uma classificação específica."
          onClick={() => onSelect("compare")}
        />
        <Card
          icon={<Scale className="h-5 w-5" />}
          title="Analisar Saldo Invertido"
          description="Valida a natureza (D/C) do Saldo Atual conforme a classificação e detecta saldos baixos."
          onClick={() => onSelect("inverted")}
        />
      </div>
    </div>
  );
}

function Card({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col gap-4 rounded-xl border border-border bg-card p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent/30 text-accent-foreground">
          {icon}
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="mt-auto h-1 w-10 rounded-full bg-accent transition-all group-hover:w-16" />
    </button>
  );
}
