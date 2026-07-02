import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Empresa, Usuario } from "@/types/db";

// ============================================================
// Autenticação (RF01). Resolve a sessão do Supabase e o perfil
// (usuarios + empresa) do usuário logado. Sessão persiste sozinha
// (persistSession no cliente); aqui reagimos a onAuthStateChange.
// ============================================================

type AuthStatus =
  | "carregando" // ainda resolvendo sessão/perfil
  | "deslogado" // sem sessão
  | "sem_perfil" // sessão válida mas sem linha em usuarios (conta não provisionada)
  | "pronto"; // sessão + perfil resolvidos

interface AuthState {
  status: AuthStatus;
  session: Session | null;
  perfil: Usuario | null;
  empresa: Empresa | null;
  signIn: (email: string, senha: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Traduz erros do Supabase Auth para mensagens em pt-BR. */
function traduzErro(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "E-mail ainda não confirmado.";
  if (m.includes("network")) return "Sem conexão. Verifique a internet.";
  return "Não foi possível entrar. Tente novamente.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("carregando");
  const [session, setSession] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Usuario | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);

  const [booted, setBooted] = useState(false);

  // 1) Só ATUALIZA a sessão aqui. Importante: não chamar outras funções do
  // Supabase (ex.: .from()) dentro do callback de onAuthStateChange — isso
  // pode travar/repetir o callback. A resolução do perfil vai no efeito (2).
  useEffect(() => {
    let vivo = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return;
      setSession(data.session);
      setBooted(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setBooted(true);
    });

    return () => {
      vivo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // 2) Resolve perfil (usuarios + empresa) quando o usuário muda. Keyed no
  // id do usuário: refresh de token (mesmo id) não re-dispara. Qualquer falha
  // (schema ausente, sem vínculo) cai em 'sem_perfil' — nunca fica em 'carregando'.
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!booted) return;
    let vivo = true;
    (async () => {
      if (!session) {
        setPerfil(null);
        setEmpresa(null);
        setStatus("deslogado");
        return;
      }
      setStatus("carregando");
      try {
        const { data: u, error } = await supabase
          .from("usuarios")
          .select("id, empresa_id, nome, papel, ativo")
          .eq("id", session.user.id)
          .maybeSingle();
        if (!vivo) return;
        if (error || !u) {
          setPerfil(null);
          setEmpresa(null);
          setStatus("sem_perfil");
          return;
        }
        setPerfil(u as Usuario);
        const { data: e } = await supabase
          .from("empresas")
          .select("id, nome, plano, criado_em")
          .eq("id", u.empresa_id)
          .maybeSingle();
        if (!vivo) return;
        setEmpresa((e as Empresa) ?? null);
        setStatus("pronto");
      } catch {
        if (!vivo) return;
        setPerfil(null);
        setEmpresa(null);
        setStatus("sem_perfil");
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booted, userId]);

  const value = useMemo<AuthState>(
    () => ({
      status,
      session,
      perfil,
      empresa,
      async signIn(email, senha) {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: senha,
        });
        return { error: error ? traduzErro(error.message) : null };
      },
      async signOut() {
        await supabase.auth.signOut();
      },
    }),
    [status, session, perfil, empresa],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}
