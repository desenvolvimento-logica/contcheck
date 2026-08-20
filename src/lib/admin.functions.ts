import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { failSafe, generateProvisionalPassword } from "@/lib/server-helpers";

const userRow = z.object({
  nome: z.string().min(1).max(120),
  email: z.string().email().max(255),
  perfil: z.enum(["usuario", "lider", "coordenador"]),
  senha_provisoria: z.string().min(6).max(72),
});

const bulkSchema = z.object({ users: z.array(userRow).min(1).max(500) });

async function ensureAdmin(
  supabase: {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
          };
        };
      };
    };
  },
  userId: string,
) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) failSafe(error, "Não foi possível validar permissões.");
  if (!data) throw new Error("Acesso negado: somente administradores.");
}


export const bulkCreateUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bulkSchema.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase as never, context.userId);
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
          console.error("[bulkCreateUsers]", error?.message);
          const weak = /weak|pwned/i.test(error?.message ?? "");
          results.push({
            email: u.email,
            status: "failed",
            message: weak
              ? "Senha provisória muito fraca/vazada. Use outra senha."
              : "Não foi possível criar este usuário.",
          });
          continue;
        }
        await supabaseAdmin
          .from("profiles")
          .update({ nome: u.nome, must_change_password: true })
          .eq("id", created.user.id);
        results.push({ email: u.email, status: "created" });
      } catch (err) {
        console.error("[bulkCreateUsers]", err);
        results.push({ email: u.email, status: "failed", message: "Erro inesperado." });
      }
    }
    return { results };
  });

export const listAllUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase as never, context.userId);
    const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
      context.supabase.from("profiles").select("id, nome, email, must_change_password, created_at"),
      context.supabase.from("user_roles").select("user_id, role"),
    ]);
    if (pErr) failSafe(pErr, "Não foi possível carregar os usuários.");
    if (rErr) failSafe(rErr, "Não foi possível carregar os perfis.");
    const rolesById = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
    return (profiles ?? [])
      .map((p) => ({ ...p, role: rolesById.get(p.id) ?? "usuario" }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  });

const updateSchema = z.object({
  user_id: z.string().uuid(),
  nome: z.string().min(1).max(120),
  email: z.string().email().max(255),
  perfil: z.enum(["usuario", "lider", "coordenador", "admin"]),
});

export const updateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      email: data.email,
      email_confirm: true,
    });
    if (aErr) failSafe(aErr, "Não foi possível atualizar o e-mail do usuário.");

    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({ nome: data.nome, email: data.email })
      .eq("id", data.user_id);
    if (pErr) failSafe(pErr, "Não foi possível atualizar o perfil.");

    const { data: existing, error: rSelErr } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user_id)
      .maybeSingle();
    if (rSelErr) failSafe(rSelErr, "Não foi possível ler o papel atual.");

    if (!existing || existing.role !== data.perfil) {
      const { error: rDelErr } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.user_id);
      if (rDelErr) failSafe(rDelErr, "Não foi possível atualizar o papel.");
      const { error: rInsErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.user_id, role: data.perfil });
      if (rInsErr) failSafe(rInsErr, "Não foi possível atribuir o novo papel.");
    }

    return { ok: true };
  });

const resetSchema = z.object({
  user_id: z.string().uuid(),
  mode: z.enum(["padrao", "custom"]),
  nova_senha: z.string().min(6).max(72).optional(),
});

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => resetSchema.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const senha =
      data.mode === "custom" ? data.nova_senha : generateProvisionalPassword();
    if (!senha || senha.length < 6) {
      throw new Error("Senha inválida.");
    }

    const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: senha,
    });
    if (aErr) {
      failSafe(
        aErr,
        /weak|pwned/i.test(aErr.message ?? "")
          ? "Esta senha é muito comum ou apareceu em vazamentos. Escolha outra."
          : "Não foi possível redefinir a senha.",
      );
    }

    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", data.user_id);
    if (pErr) failSafe(pErr, "Não foi possível marcar a troca obrigatória de senha.");

    return {
      ok: true,
      // Returned once to the admin. For 'custom' mode the admin already knows it;
      // for 'padrao' this is the only chance to see the freshly generated password.
      senha: data.mode === "padrao" ? senha : null,
    };
  });
