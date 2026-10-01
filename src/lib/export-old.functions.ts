import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

// TEMPORÁRIO — exporta dados do banco antigo (Lovable Cloud nativo). Apagar após uso.
export const exportOldData = createServerFn({ method: "POST" }).handler(async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Variáveis do banco antigo ausentes");
  const db = createClient(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  async function all(table: string) {
    const rows: unknown[] = [];
    const size = 1000;
    for (let from = 0; ; from += size) {
      const { data, error } = await db.from(table).select("*").range(from, from + size - 1);
      if (error) throw new Error(`${table}: ${error.message}`);
      rows.push(...(data ?? []));
      if (!data || data.length < size) break;
    }
    return rows;
  }

  return JSON.parse(
    JSON.stringify({
      cc_profiles: await all("cc_profiles"),
      cc_user_roles: await all("cc_user_roles"),
      cc_analyses: await all("cc_analyses"),
    }),
  ) as Record<string, unknown[]>;
});
