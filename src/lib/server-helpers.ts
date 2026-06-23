// Server-only helpers for server functions.
// Keeps cross-cutting checks (password change enforcement, error sanitization)
// in one place so every sensitive RPC stays consistent.

type AnySupabase = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{ data: { must_change_password: boolean } | null; error: { message: string } | null }>;
        eq?: (col: string, val: string) => unknown;
      };
    };
  };
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export async function ensurePasswordChanged(supabase: AnySupabase, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("must_change_password")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("[ensurePasswordChanged]", error.message);
    throw new Error("Não foi possível validar a sessão.");
  }
  if (data?.must_change_password) {
    throw new Error("PASSWORD_CHANGE_REQUIRED");
  }
}

// Generic mapping of Supabase/PG errors to a safe user-facing message.
// The raw error is logged server-side; only the friendly message is thrown.
export function failSafe(error: { message?: string; code?: string } | null | undefined, friendly: string): never {
  console.error("[server-error]", error?.code ?? "", error?.message ?? "");
  throw new Error(friendly);
}

export function generateProvisionalPassword(): string {
  // 16 chars, mixed case + digits + symbol. Cryptographically random.
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 14; i++) out += alphabet[bytes[i] % alphabet.length];
  // Ensure complexity: append a digit and symbol deterministically from remaining bytes.
  out += String(bytes[14] % 10);
  const symbols = "!@#$%&*?";
  out += symbols[bytes[15] % symbols.length];
  return out;
}
