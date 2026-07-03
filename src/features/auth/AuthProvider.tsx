import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Empresa, Usuario } from "@/types/db";

// ============================================================
// Autenticação (RF01) + cadastro autônomo (M9). Resolve sessão e perfil
// (usuarios + empresa) e expõe signIn/signUp/criarEmpresa/signOut.
// ============================================================

type AuthStatus =
  | "carregando" // ainda resolvendo sessão/perfil
  | "deslogado" // sem sessão
  | "sem_perfil" // sessão válida mas sem empresa vinculada
  | "pronto"; // sessão + perfil resolvidos

interface AuthState {
  status: AuthStatus;
  session: Session | null;
  perfil: Usuario | null;
  empresa: Empresa | null;
  signIn: (email: string, senha: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    senha: string,
  ) => Promise<{ error: string | null; precisaConfirmar: boolean }>;
  /** Cria a empresa (trial) e vincula o usuário logado como admin (RPC). */
  criarEmpresaComAdmin: (
    nomeEmpresa: string,
    nomeUsuario: string,
  ) => Promise<{ error: string | null }>;
  /** Aceita um convite pendente para o e-mail logado, vinculando à empresa. */
  aceitarConvite: (nomeUsuario: string) => Promise<{ error: string | null }>;
  recarregarPerfil: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Busca a empresa tolerando bases sem a coluna trial_expira_em (pré-migration 0006). */
async function buscarEmpresa(empresaId: string): Promise<Empresa | null> {
  const full = await supabase
    .from("empresas")
    .select("id, nome, plano, trial_expira_em, criado_em")
    .eq("id", empresaId)
    .maybeSingle();
  if (!full.error) return (full.data as Empresa) ?? null;

  const base = await supabase
    .from("empresas")
    .select("id, nome, plano, criado_em")
    .eq("id", empresaId)
    .maybeSingle();
  if (base.error || !base.data) return null;
  return { ...(base.data as Omit<Empresa, "trial_expira_em">), trial_expira_em: null };
}

/** Traduz erros do Supabase Auth para mensagens em pt-BR. */
function traduzErro(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "E-mail ainda não confirmado.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "Este e-mail já está cadastrado. Faça login.";
  if (m.includes("password") && m.includes("6")) return "A senha precisa ter ao menos 6 caracteres.";
  if (m.includes("já vinculado")) return "Sua conta já tem uma empresa.";
  if (m.includes("network")) return "Sem conexão. Verifique a internet.";
  return "Não foi possível concluir. Tente novamente.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("carregando");
  const [session, setSession] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Usuario | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [booted, setBooted] = useState(false);

  // Sequência para descartar resoluções obsoletas (troca de usuário / recarga).
  const seqRef = useRef(0);

  const resolver = useCallback(async (s: Session | null) => {
    const seq = ++seqRef.current;
    const atual = () => seq === seqRef.current;
    if (!s) {
      if (atual()) {
        setPerfil(null);
        setEmpresa(null);
        setStatus("deslogado");
      }
      return;
    }
    setStatus("carregando");
    try {
      const { data: u, error } = await supabase
        .from("usuarios")
        .select("id, empresa_id, nome, papel, ativo")
        .eq("id", s.user.id)
        .maybeSingle();
      if (!atual()) return;
      if (error || !u) {
        setPerfil(null);
        setEmpresa(null);
        setStatus("sem_perfil");
        return;
      }
      setPerfil(u as Usuario);
      const e = await buscarEmpresa(u.empresa_id);
      if (!atual()) return;
      setEmpresa(e);
      setStatus("pronto");
    } catch {
      if (atual()) {
        setPerfil(null);
        setEmpresa(null);
        setStatus("sem_perfil");
      }
    }
  }, []);

  // 1) Só atualiza a sessão no callback (não chamar .from() aqui — trava/loop).
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

  // 2) Resolve o perfil quando o usuário muda (keyed no id → refresh não redispara).
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!booted) return;
    void resolver(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booted, userId, resolver]);

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
      async signUp(email, senha) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: senha,
        });
        if (error) return { error: traduzErro(error.message), precisaConfirmar: false };
        // Sem sessão ⇒ o projeto exige confirmação de e-mail antes do login.
        return { error: null, precisaConfirmar: !data.session };
      },
      async criarEmpresaComAdmin(nomeEmpresa, nomeUsuario) {
        const { error } = await supabase.rpc("criar_empresa_e_admin", {
          p_nome_empresa: nomeEmpresa,
          p_nome_usuario: nomeUsuario,
        });
        if (error) return { error: traduzErro(error.message) };
        await resolver(session);
        return { error: null };
      },
      async aceitarConvite(nomeUsuario) {
        const { error } = await supabase.rpc("aceitar_convite", {
          p_nome: nomeUsuario,
        });
        if (error) return { error: traduzErro(error.message) };
        await resolver(session);
        return { error: null };
      },
      recarregarPerfil: () => resolver(session),
      async signOut() {
        await supabase.auth.signOut();
      },
    }),
    [status, session, perfil, empresa, resolver],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}
