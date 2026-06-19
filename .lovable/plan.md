
## Visão geral

Adicionar autenticação completa + RBAC (admin / coordenador / líder / usuário), painel do admin com cadastro em massa via CSV, persistência de cada análise feita no Comparador, tela de visualização das análises da equipe (com hierarquia) e dashboard de KPIs para líderes/coordenadores.

## 1. Backend (Lovable Cloud)

Habilitar Lovable Cloud e criar via migration:

- `app_role` enum: `admin`, `coordenador`, `lider`, `usuario`
- `profiles` (id = auth.users.id, nome, email, must_change_password bool)
- `user_roles` (user_id, role) + função `has_role(uuid, app_role)` security definer
- `analyses` (id, user_id, created_at, file_a_name, file_b_name, month_a, month_b, threshold, total_classifications, above_limit_count, avg_variation)
- Trigger `handle_new_user` → cria profile automaticamente
- RLS:
  - `analyses`: usuário vê as próprias; líder vê as próprias + usuários comuns; coordenador vê líderes + usuários comuns + próprias; admin vê tudo
  - `profiles`: usuário vê o próprio; admin vê todos
  - `user_roles`: leitura via `has_role`, escrita só admin
- GRANTs em todas as tabelas públicas
- Seed do admin: `desenvolvimento@escritogiologica.com.br` recebe role `admin` automaticamente via trigger ao se cadastrar (ou criado manualmente na primeira execução)

## 2. Autenticação

- Rota pública `/auth` com formulário email/senha (sem botões de cadastro/reset)
- Layout `_authenticated` gerenciado pela integração protege o resto
- Sign-in: após login, se `must_change_password = true` e não é admin → redireciona para `/change-password`
- Rota `/change-password`: form com nova senha + confirmação; atualiza senha via `supabase.auth.updateUser` e marca `must_change_password = false`
- Header com botão Sair

## 3. Painel do admin (`/_authenticated/admin`)

- Visível só para admin (gate via `has_role`)
- Upload de CSV com colunas: `nome,email,perfil,senha_provisoria`
- Parse client-side (papaparse) + envio a server function `bulkCreateUsers` (admin-only):
  - Verifica caller é admin (`has_role`)
  - Para cada linha usa `supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nome } })`
  - Insere em `user_roles` com perfil mapeado
  - Marca profile com `must_change_password = true`
- Mostra resultado: criados / falhas com motivo
- Lista de usuários existentes com seu perfil

## 4. Persistência da análise

No `CompareLaunches`, ao gerar o quadro de variação chamar server fn `saveAnalysis` salvando: nomes dos PDFs, meses comparados, threshold, total de classificações 5º nível analisadas, qtd acima do limite, média de variação geral. Toast confirma "Análise registrada".

## 5. Tela "Análises da equipe" (`/_authenticated/team-analyses`)

- Tabela das análises visíveis ao usuário corrente (RLS faz o filtro):
  - usuário comum: só as suas
  - líder: as suas + dos `usuario`
  - coordenador: as suas + `lider` + `usuario`
- Colunas: data, autor, perfil, arquivos, meses, qtd. acima do limite, variação média
- Filtros: por autor, período

## 6. Dashboard (`/_authenticated/dashboard`)

Acesso só líder/coordenador (gate via `has_role`). KPIs derivados de `analyses` filtradas por RLS:
- Total de análises no período (filtro 7/30/90 dias)
- Top usuários por nº de análises
- Total de classificações acima do limite (soma)
- Variação média agregada
- Gráficos simples com `recharts` (já no projeto)

## 7. Navegação

Atualizar `__root.tsx` com header condicional:
- Sempre: Comparador
- Líder/Coordenador: Dashboard, Análises da Equipe
- Admin: Admin
- Logado: Sair

## Detalhes técnicos

- Server functions em `src/lib/admin.functions.ts` e `src/lib/analyses.functions.ts` (client-safe paths). `supabaseAdmin` importado dinâmico dentro dos handlers.
- `requireSupabaseAuth` middleware para todas as fns autenticadas; `attachSupabaseAuth` já wired.
- Senha provisória válida; troca obrigatória controlada por `profiles.must_change_password` (admin isento).
- CSV parse com `papaparse` (bun add).
- Admin bootstrap: depois de habilitar Cloud, peço para você criar o usuário admin uma vez (signup via Auth) ou cadastro por CSV de um seed inicial — o trigger detecta o email `desenvolvimento@escritogiologica.com.br` e atribui role `admin` + `must_change_password=false`.

Posso seguir?
