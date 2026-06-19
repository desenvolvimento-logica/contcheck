import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const CURRENT_VERSION = "2026-06-19";
const STORAGE_KEY = "patch-notes-seen";

type Entry = {
  title: string;
  items: (string | { label: string; sub: string[] })[];
};

const SECTIONS: { heading: string; entries: Entry[] }[] = [
  {
    heading: "🔐 Acesso e segurança",
    entries: [
      {
        title: "",
        items: [
          "Login com e-mail e senha individuais.",
          "Troca de senha no primeiro acesso quando você receber uma senha provisória.",
          "Página para trocar a senha sempre que quiser, no menu superior.",
        ],
      },
    ],
  },
  {
    heading: "👥 Perfis de usuário",
    entries: [
      {
        title: "Cada pessoa tem um perfil que define o que pode visualizar:",
        items: [
          "Usuário: vê apenas as próprias análises.",
          "Líder: vê as análises da própria equipe.",
          "Coordenador: vê as análises dos líderes e dos usuários.",
          "Administrador: gerencia o cadastro de pessoas.",
        ],
      },
    ],
  },
  {
    heading: "🛠️ Painel do Administrador",
    entries: [
      {
        title: "",
        items: [
          "Cadastro em massa por planilha (CSV) com nome, e-mail, perfil e senha provisória.",
          "Lista de usuários cadastrados com indicação de quem ainda precisa trocar a senha.",
          "Editar usuário: nome, e-mail e perfil.",
          {
            label: "Redefinir senha em dois modos:",
            sub: [
              "Padrão: aplica a senha provisória Trocar@123 e obriga a troca no próximo login.",
              "Personalizada: o administrador escolhe a nova senha provisória — a pessoa também troca no próximo login.",
            ],
          },
        ],
      },
    ],
  },
  {
    heading: "📊 Análises mais úteis",
    entries: [
      {
        title: "Comparador de lançamentos",
        items: [
          "Arrastar para rolar a tabela: clique, segure e deslize para ver as colunas escondidas.",
          "Colunas fixas (Classificação e Descrição) visíveis o tempo todo.",
          "Histórico salvo automaticamente ao concluir uma análise.",
        ],
      },
      {
        title: "Minhas análises e Equipe",
        items: [
          "Tela com o histórico das análises já realizadas.",
          "Líderes e coordenadores acompanham as análises da equipe conforme a hierarquia.",
        ],
      },
    ],
  },
  {
    heading: "📈 Dashboard (Líderes e Coordenadores)",
    entries: [
      {
        title: "Principais indicadores em um só lugar:",
        items: [
          "Total de análises realizadas no período.",
          "Análises por usuário.",
          "Classificações acima do limite.",
          "Variação média por classificação.",
        ],
      },
    ],
  },
  {
    heading: "💡 Dicas finais",
    entries: [
      {
        title: "",
        items: [
          "Esqueceu a senha? Fale com o administrador para redefinir.",
          "Mantenha o navegador atualizado para uma melhor experiência.",
        ],
      },
    ],
  },
];

export function PatchNotesBell() {
  const [open, setOpen] = useState(false);
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      setHasNew(seen !== CURRENT_VERSION);
    } catch {
      setHasNew(true);
    }
  }, []);

  function handleOpen(o: boolean) {
    setOpen(o);
    if (o) {
      try {
        localStorage.setItem(STORAGE_KEY, CURRENT_VERSION);
      } catch {
        // ignore
      }
      setHasNew(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpen(true)}
        className="relative inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-muted"
        title="Novidades da plataforma"
        aria-label="Novidades da plataforma"
      >
        <Bell className="h-3.5 w-3.5" />
        {hasNew && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-card" />
        )}
      </button>

      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>📢 Novidades da plataforma</DialogTitle>
            <DialogDescription>
              Confira o que mudou recentemente para deixar o seu dia a dia mais simples.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 pt-2 text-sm">
            {SECTIONS.map((section) => (
              <section key={section.heading}>
                <h3 className="mb-2 text-sm font-semibold text-foreground">
                  {section.heading}
                </h3>
                <div className="space-y-3 text-muted-foreground">
                  {section.entries.map((entry, i) => (
                    <div key={i}>
                      {entry.title && (
                        <p className="mb-1 font-medium text-foreground">{entry.title}</p>
                      )}
                      <ul className="ml-4 list-disc space-y-1">
                        {entry.items.map((item, j) =>
                          typeof item === "string" ? (
                            <li key={j}>{item}</li>
                          ) : (
                            <li key={j}>
                              {item.label}
                              <ul className="ml-4 mt-1 list-[circle] space-y-1">
                                {item.sub.map((s, k) => (
                                  <li key={k}>{s}</li>
                                ))}
                              </ul>
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
