import { useEffect, useState } from "react";
import {
  createFileRoute,
  Outlet,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { LogOut, BarChart3, Users, Shield, Home as HomeIcon, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PatchNotesBell } from "@/components/PatchNotes";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data, error }) => {
      if (!mounted) return;
      if (error || !data.user) {
        navigate({ to: "/auth" });
      } else {
        setReady(true);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") navigate({ to: "/auth" });
      if (event === "SIGNED_IN" || event === "USER_UPDATED") router.invalidate();
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate, router]);

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Carregando...</div>;
  }

  return <Shell />;
}

function Shell() {
  const { data: me } = useCurrentUser();
  const navigate = useNavigate();
  const role = me?.role ?? "usuario";
  const isAdmin = role === "admin";
  const isLeader = role === "lider" || role === "coordenador" || role === "admin";

  // Force password change for non-admin users with pending change
  useEffect(() => {
    if (me?.profile.must_change_password && role !== "admin") {
      navigate({ to: "/change-password" });
    }
  }, [me, role, navigate]);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-md bg-accent" aria-hidden />
              <span className="text-sm font-semibold tracking-tight text-foreground">
                Auditoria Contábil
              </span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <NavLink to="/" icon={<HomeIcon className="h-3.5 w-3.5" />} label="Análises" />
              {isLeader && (
                <>
                  <NavLink to="/dashboard" icon={<BarChart3 className="h-3.5 w-3.5" />} label="Dashboard" />
                  <NavLink to="/team-analyses" icon={<Users className="h-3.5 w-3.5" />} label="Equipe" />
                </>
              )}
              {!isLeader && (
                <NavLink to="/team-analyses" icon={<Users className="h-3.5 w-3.5" />} label="Minhas análises" />
              )}
              {isAdmin && <NavLink to="/admin" icon={<Shield className="h-3.5 w-3.5" />} label="Admin" />}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="hidden sm:inline">
              {me?.profile.nome || me?.profile.email} · <span className="capitalize">{role}</span>
            </span>
            <PatchNotesBell />
            <Link
              to="/change-password"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-muted"
              title="Alterar senha"
            >
              <KeyRound className="h-3.5 w-3.5" />
            </Link>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-muted"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair
            </button>
          </div>
        </div>
      </header>
      <main className="px-6 py-10 sm:py-12">
        <Outlet />
      </main>
    </div>
  );
}

function NavLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&.active]:bg-muted [&.active]:text-foreground"
      activeOptions={{ exact: true }}
    >
      {icon}
      {label}
    </Link>
  );
}
