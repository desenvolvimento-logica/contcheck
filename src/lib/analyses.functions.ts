import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const saveSchema = z.object({
  fileName: z.string().min(1).max(255),
  months: z.array(z.string().max(40)).max(24),
  threshold: z.number().nonnegative(),
  totalClassifications: z.number().int().nonnegative(),
  aboveLimitCount: z.number().int().nonnegative(),
  avgVariation: z.number(),
  topClassifications: z
    .array(
      z.object({
        classification: z.string().max(40),
        description: z.string().max(255).optional().default(""),
        avgVariation: z.number(),
      }),
    )
    .max(20),
});

export const saveAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error, data: row } = await context.supabase
      .from("analyses")
      .insert({
        user_id: context.userId,
        analysis_type: "compare_launches",
        file_name: data.fileName,
        months: data.months,
        threshold: data.threshold,
        total_classifications: data.totalClassifications,
        above_limit_count: data.aboveLimitCount,
        avg_variation: data.avgVariation,
        top_classifications: data.topClassifications,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const listAnalyses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("analyses")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const userIds = Array.from(new Set((data ?? []).map((a) => a.user_id)));
    let profilesById = new Map<string, { nome: string; email: string }>();
    let rolesById = new Map<string, string>();
    if (userIds.length > 0) {
      const [profilesRes, rolesRes] = await Promise.all([
        context.supabase.from("profiles").select("id, nome, email").in("id", userIds),
        context.supabase.from("user_roles").select("user_id, role").in("user_id", userIds),
      ]);
      if (profilesRes.data) {
        profilesById = new Map(
          profilesRes.data.map((p) => [p.id, { nome: p.nome, email: p.email }]),
        );
      }
      if (rolesRes.data) {
        rolesById = new Map(rolesRes.data.map((r) => [r.user_id, r.role]));
      }
    }

    return (data ?? []).map((a) => ({
      ...a,
      author: profilesById.get(a.user_id) ?? { nome: "—", email: "—" },
      role: rolesById.get(a.user_id) ?? "usuario",
    }));
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: profile }, { data: roles }] = await Promise.all([
      context.supabase
        .from("profiles")
        .select("id, nome, email, must_change_password")
        .eq("id", context.userId)
        .maybeSingle(),
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
    ]);
    const order = { admin: 1, coordenador: 2, lider: 3, usuario: 4 } as const;
    const role = (roles ?? [])
      .map((r) => r.role as keyof typeof order)
      .sort((a, b) => order[a] - order[b])[0] ?? "usuario";
    return {
      profile: profile ?? {
        id: context.userId,
        nome: "",
        email: "",
        must_change_password: false,
      },
      role,
    };
  });

export const markPasswordChanged = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
