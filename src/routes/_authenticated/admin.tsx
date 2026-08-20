import { useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import Papa from "papaparse";
import { Loader2, Upload, FileText, Pencil, KeyRound, X } from "lucide-react";
import { bulkCreateUsers, listAllUsers, updateUser, resetUserPassword } from "@/lib/admin.functions";
import { useCurrentUser } from "@/hooks/use-current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

type UserRow = {
  id: string;
  nome: string;
  email: string;
  must_change_password: boolean;
  role: string;
};


type CsvPerfil = "usuario" | "lider" | "coordenador";
type CsvRow = { nome: string; email: string; perfil: string; senha_provisoria: string };

function AdminPage() {
  const navigate = useNavigate();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const list = useServerFn(listAllUsers);
  const bulk = useServerFn(bulkCreateUsers);
  const update = useServerFn(updateUser);
  const resetPwd = useServerFn(resetUserPassword);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsedRows, setParsedRows] = useState<CsvRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<
    { email: string; status: "created" | "failed"; message?: string }[] | null
  >(null);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const [single, setSingle] = useState<{ nome: string; email: string; perfil: CsvPerfil; senha: string }>({
    nome: "",
    email: "",
    perfil: "usuario",
    senha: "",
  });



  if (!meLoading && me && me.role !== "admin") {
    navigate({ to: "/" });
  }

  const usersQuery = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => list(),
    enabled: me?.role === "admin",
  });

  const createMutation = useMutation({
    mutationFn: (users: CsvRow[]) =>
      bulk({
        data: {
          users: users.map((u) => ({
            nome: u.nome,
            email: u.email,
            perfil: u.perfil as "usuario" | "lider" | "coordenador",
            senha_provisoria: u.senha_provisoria,
          })),
        },
      }),
    onSuccess: (res) => {
      setLastResult(res.results);
      setParsedRows([]);
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { user_id: string; nome: string; email: string; perfil: "usuario" | "lider" | "coordenador" | "admin" }) =>
      update({ data: vars }),
    onSuccess: () => {
      toast.success("Usuário atualizado.");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Falha ao atualizar."),
  });

  const resetMutation = useMutation({
    mutationFn: (vars: { user_id: string; mode: "padrao" | "custom"; nova_senha?: string }) =>
      resetPwd({ data: vars }),
    onSuccess: (res) => {
      if (res?.senha) {
        toast.success(`Senha provisória gerada: ${res.senha}`, { duration: 15000 });
      } else {
        toast.success("Senha redefinida. O usuário deverá alterá-la no próximo login.");
      }
      setResetting(null);
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Falha ao redefinir senha."),
  });




  function handleFile(file: File) {
    setParseError(null);
    setLastResult(null);
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) =>
        h.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_"),
      complete: (res) => {
        const required = ["nome", "email", "perfil", "senha_provisoria"];
        const headers = res.meta.fields ?? [];
        const missing = required.filter((h) => !headers.includes(h));
        if (missing.length > 0) {
          setParseError(`Colunas faltando: ${missing.join(", ")}`);
          return;
        }
        const rows: CsvRow[] = [];
        const errors: string[] = [];
        res.data.forEach((r, i) => {
          const nome = (r.nome ?? "").trim();
          const email = (r.email ?? "").trim().toLowerCase();
          const perfil = (r.perfil ?? "").trim().toLowerCase();
          const senha = (r.senha_provisoria ?? "").trim();
          if (!nome || !email || !perfil || !senha) {
            errors.push(`Linha ${i + 2}: campos obrigatórios em branco.`);
            return;
          }
          if (!["usuario", "lider", "coordenador"].includes(perfil)) {
            errors.push(`Linha ${i + 2}: perfil "${perfil}" inválido.`);
            return;
          }
          if (senha.length < 6) {
            errors.push(`Linha ${i + 2}: senha provisória precisa ter pelo menos 6 caracteres.`);
            return;
          }
          rows.push({ nome, email, perfil, senha_provisoria: senha });
        });
        if (errors.length > 0) setParseError(errors.join(" "));
        setParsedRows(rows);
      },
      error: (err) => setParseError(err.message),
    });
  }

  if (me?.role !== "admin") {
    return <p className="text-sm text-muted-foreground">Verificando permissão...</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Painel do Administrador</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cadastre usuários em massa a partir de um arquivo CSV com as colunas:{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">nome,email,perfil,senha_provisoria</code>.
          Perfis aceitos: usuario, lider, coordenador.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">Adicionar usuário</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cadastro individual, sem precisar de arquivo CSV.
        </p>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const nome = single.nome.trim();
            const email = single.email.trim().toLowerCase();
            const senha = single.senha.trim();
            if (!nome || !email || senha.length < 6) {
              toast.error("Preencha nome, e-mail e uma senha com ao menos 6 caracteres.");
              return;
            }
            singleMutation.mutate({ nome, email, perfil: single.perfil, senha_provisoria: senha });
          }}
        >
          <input
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Nome"
            value={single.nome}
            onChange={(e) => setSingle((s) => ({ ...s, nome: e.target.value }))}
          />
          <input
            type="email"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="E-mail"
            value={single.email}
            onChange={(e) => setSingle((s) => ({ ...s, email: e.target.value }))}
          />
          <select
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={single.perfil}
            onChange={(e) =>
              setSingle((s) => ({ ...s, perfil: e.target.value as CsvPerfil }))
            }
          >
            <option value="usuario">Usuário</option>
            <option value="lider">Líder</option>
            <option value="coordenador">Coordenador</option>
          </select>
          <input
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Senha provisória (mín. 6)"
            value={single.senha}
            onChange={(e) => setSingle((s) => ({ ...s, senha: e.target.value }))}
          />
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={singleMutation.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {singleMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Cadastrar usuário
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">

        <h2 className="text-lg font-semibold text-foreground">Importar CSV</h2>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-muted">
            <Upload className="h-4 w-4" />
            Selecionar arquivo
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>
          {parsedRows.length > 0 && (
            <button
              onClick={() => createMutation.mutate(parsedRows)}
              disabled={createMutation.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Cadastrar {parsedRows.length} usuário(s)
            </button>
          )}
        </div>

        {parseError && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {parseError}
          </p>
        )}

        {parsedRows.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Nome</th>
                  <th className="px-3 py-2 text-left">E-mail</th>
                  <th className="px-3 py-2 text-left">Perfil</th>
                  <th className="px-3 py-2 text-left">Senha provisória</th>
                </tr>
              </thead>
              <tbody>
                {parsedRows.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-2">{r.nome}</td>
                    <td className="px-3 py-2">{r.email}</td>
                    <td className="px-3 py-2 capitalize">{r.perfil}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.senha_provisoria}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {lastResult && (
          <div className="mt-4 space-y-2">
            <h3 className="text-sm font-semibold">Resultado do cadastro</h3>
            <ul className="space-y-1 text-sm">
              {lastResult.map((r) => (
                <li
                  key={r.email}
                  className={r.status === "created" ? "text-success" : "text-destructive"}
                >
                  {r.email} — {r.status === "created" ? "criado" : `falhou: ${r.message}`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Usuários cadastrados</h2>
          <span className="text-xs text-muted-foreground">
            {usersQuery.data?.length ?? 0} usuário(s)
          </span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Nome</th>
                <th className="px-3 py-2 text-left">E-mail</th>
                <th className="px-3 py-2 text-left">Perfil</th>
                <th className="px-3 py-2 text-left">Senha pendente?</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {(usersQuery.data ?? []).map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-3 py-2">{u.nome || "—"}</td>
                  <td className="px-3 py-2">{u.email}</td>
                  <td className="px-3 py-2 capitalize">{u.role}</td>
                  <td className="px-3 py-2">
                    {u.must_change_password ? (
                      <span className="inline-flex items-center gap-1 text-warning-foreground">
                        <FileText className="h-3.5 w-3.5" /> sim
                      </span>
                    ) : (
                      <span className="text-muted-foreground">não</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        onClick={() => setEditing(u as UserRow)}
                        className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-muted"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </button>
                      <button
                        onClick={() => setResetting(u as UserRow)}
                        className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-muted"
                      >
                        <KeyRound className="h-3.5 w-3.5" /> Redefinir senha
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <EditUserDialog
          user={editing}
          onClose={() => setEditing(null)}
          onSubmit={(vars) => updateMutation.mutate(vars)}
          pending={updateMutation.isPending}
        />
      )}

      {resetting && (
        <ResetPasswordDialog
          user={resetting}
          onClose={() => setResetting(null)}
          onSubmit={(payload) => resetMutation.mutate({ user_id: resetting.id, ...payload })}
          pending={resetMutation.isPending}
        />
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function EditUserDialog({
  user,
  onClose,
  onSubmit,
  pending,
}: {
  user: UserRow;
  onClose: () => void;
  onSubmit: (vars: { user_id: string; nome: string; email: string; perfil: "usuario" | "lider" | "coordenador" | "admin" }) => void;
  pending: boolean;
}) {
  const [nome, setNome] = useState(user.nome);
  const [email, setEmail] = useState(user.email);
  const [perfil, setPerfil] = useState<"usuario" | "lider" | "coordenador" | "admin">(
    (user.role as "usuario" | "lider" | "coordenador" | "admin") ?? "usuario",
  );

  return (
    <Modal title="Editar usuário" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ user_id: user.id, nome: nome.trim(), email: email.trim().toLowerCase(), perfil });
        }}
        className="space-y-4"
      >
        <div>
          <label className="text-xs font-medium text-muted-foreground">Nome</label>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            maxLength={120}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">E-mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={255}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Perfil</label>
          <select
            value={perfil}
            onChange={(e) => setPerfil(e.target.value as typeof perfil)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="usuario">Usuário</option>
            <option value="lider">Líder</option>
            <option value="coordenador">Coordenador</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordDialog({
  user,
  onClose,
  onSubmit,
  pending,
}: {
  user: UserRow;
  onClose: () => void;
  onSubmit: (payload: { mode: "padrao" | "custom"; nova_senha?: string }) => void;
  pending: boolean;
}) {
  const [mode, setMode] = useState<"padrao" | "custom">("padrao");
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [err, setErr] = useState<string | null>(null);

  return (
    <Modal title={`Redefinir senha — ${user.nome}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          if (mode === "padrao") {
            onSubmit({ mode: "padrao" });
            return;
          }
          if (senha.length < 6) return setErr("A senha precisa ter pelo menos 6 caracteres.");
          if (senha !== confirma) return setErr("As senhas não coincidem.");
          onSubmit({ mode: "custom", nova_senha: senha });
        }}
        className="space-y-4"
      >
        <div className="space-y-2">
          <label className="flex items-start gap-2 rounded-md border border-input p-3 text-sm cursor-pointer hover:bg-muted/50">
            <input
              type="radio"
              name="reset-mode"
              checked={mode === "padrao"}
              onChange={() => setMode("padrao")}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-foreground">Gerar senha provisória</span>
              <span className="block text-xs text-muted-foreground">
                Uma senha aleatória será gerada no servidor e exibida apenas uma vez para você. O usuário trocará no próximo login.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 rounded-md border border-input p-3 text-sm cursor-pointer hover:bg-muted/50">
            <input
              type="radio"
              name="reset-mode"
              checked={mode === "custom"}
              onChange={() => setMode("custom")}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-foreground">Definir uma senha</span>
              <span className="block text-xs text-muted-foreground">
                O usuário também precisará trocá-la no próximo login.
              </span>
            </span>
          </label>
        </div>

        {mode === "custom" && (
          <>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Nova senha</label>
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
                minLength={6}
                maxLength={72}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Confirmar senha</label>
              <input
                type="password"
                value={confirma}
                onChange={(e) => setConfirma(e.target.value)}
                required
                minLength={6}
                maxLength={72}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </>
        )}

        {err && <p className="text-sm text-destructive">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Redefinir
          </button>
        </div>
      </form>
    </Modal>
  );
}

