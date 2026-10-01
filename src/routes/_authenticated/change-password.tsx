import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/app-client";
import { markPasswordChanged } from "@/lib/analyses.functions";
import { translateAuthError } from "@/lib/auth-errors";

export const Route = createFileRoute("/_authenticated/change-password")({
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const mark = useServerFn(markPasswordChanged);
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (p1.length < 8) return setError("A senha deve ter pelo menos 8 caracteres.");
    if (p1 !== p2) return setError("As senhas não conferem.");
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password: p1 });
    if (err) {
      setLoading(false);
      return setError(translateAuthError(err.message));
    }

    await mark();
    await qc.invalidateQueries({ queryKey: ["me"] });
    setLoading(false);
    navigate({ to: "/" });
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold text-foreground">Definir nova senha</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Para sua segurança, defina uma senha pessoal antes de continuar.
      </p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div>
          <label className="block text-xs font-medium text-foreground">Nova senha</label>
          <input
            type="password"
            required
            value={p1}
            onChange={(e) => setP1(e.target.value)}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground">Confirmar senha</label>
          <input
            type="password"
            required
            value={p2}
            onChange={(e) => setP2(e.target.value)}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar senha
        </button>
      </form>
    </div>
  );
}
