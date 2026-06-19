import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const userRow = z.object({
  nome: z.string().min(1).max(120),
  email: z.string().email().max(255),
  perfil: z.enum(["usuario", "lider", "coordenador"]),
  senha_provisoria: z.string().min(6).max(72),
});

const bulkSchema = z.object({ users: z.array(userRow).min(1).max(500) });

type AuthCtx = { supabase: ReturnType<typeof import("@supabase/supabase-js").createClient>; userId: string };

async function ensureAdmin(context: AuthCtx) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso negado: somente administradores.");
}


export const bulkCreateUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bulkSchema.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const results: { email: string; status: "created" | "failed"; message?: string }[] = [];
    for (const u of data.users) {
      try {
        const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
          email: u.email,
          password: u.senha_provisoria,
          email_confirm: true,
          user_metadata: { nome: u.nome, perfil: u.perfil },
        });
        if (error || !created.user) {
          results.push({ email: u.email, status: "failed", message: error?.message ?? "Erro desconhecido" });
          continue;
        }
        // Trigger handle_new_user already created profile and role.
        // Ensure profile fields are normalized in case trigger fell back.
        await supabaseAdmin
          .from("profiles")
          .update({ nome: u.nome, must_change_password: true })
          .eq("id", created.user.id);
        results.push({ email: u.email, status: "created" });
      } catch (err) {
        results.push({
          email: u.email,
          status: "failed",
          message: err instanceof Error ? err.message : "Erro desconhecido",
        });
      }
    }
    return { results };
  });

export const listAllUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
      context.supabase.from("profiles").select("id, nome, email, must_change_password, created_at"),
      context.supabase.from("user_roles").select("user_id, role"),
    ]);
    if (pErr) throw new Error(pErr.message);
    if (rErr) throw new Error(rErr.message);
    const rolesById = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
    return (profiles ?? [])
      .map((p) => ({ ...p, role: rolesById.get(p.id) ?? "usuario" }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  });
