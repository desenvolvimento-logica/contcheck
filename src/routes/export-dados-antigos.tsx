import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { exportOldData } from "@/lib/export-old.functions";

export const Route = createFileRoute("/export-dados-antigos")({
  head: () => ({
    meta: [
      { title: "Exportar dados antigos" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ExportPage,
});

function ExportPage() {
  const run = useServerFn(exportOldData);
  const [status, setStatus] = useState("");

  async function download() {
    setStatus("Exportando...");
    try {
      const data = await run();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "contcheck-export.json";
      a.click();
      URL.revokeObjectURL(url);
      setStatus(
        `Pronto: ${data.cc_profiles.length} perfis, ${data.cc_user_roles.length} papéis, ${data.cc_analyses.length} análises.`,
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Erro ao exportar.");
    }
  }

  return (
    <div className="p-10 space-y-4">
      <button
        onClick={download}
        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
      >
        Baixar JSON
      </button>
      {status && <p className="text-sm text-foreground">{status}</p>}
    </div>
  );
}
