// Traduz erros do provedor de autenticação para mensagens claras em português.
export function translateAuthError(raw: string | undefined | null): string {
  const m = (raw ?? "").toLowerCase();
  if (m.includes("weak") || m.includes("pwned")) {
    return "Esta senha é muito comum e apareceu em vazamentos públicos. Escolha uma senha diferente (evite sequências, nomes ou palavras comuns).";
  }
  if (m.includes("should be at least") || m.includes("at least 6")) {
    return "A senha é curta demais. Use pelo menos 8 caracteres.";
  }
  if (m.includes("already registered") || m.includes("already")) {
    return "Já existe uma conta com este e-mail.";
  }
  if (m.includes("invalid login credentials")) {
    return "E-mail ou senha inválidos.";
  }
  if (m.includes("email rate limit") || m.includes("rate limit")) {
    return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  }
  if (m.includes("same as the old")) {
    return "A nova senha precisa ser diferente da atual.";
  }
  return "Não foi possível concluir a operação. Tente novamente.";
}
