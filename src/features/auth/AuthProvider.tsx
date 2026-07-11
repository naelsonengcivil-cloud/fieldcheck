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
import { desativarPush } from "@/lib/push";
import type { Empresa, Usuario } from "@/types/db";

// ============================================================
// Autenticação (RF01) + cadastro autônomo (M9). Resolve sessão e perfil
// (usuarios + empresa) e expõe signIn/signUp/criarEmpresa/signOut.
// ============================================================

type AuthStatus =
  | "carregando" // ainda resolvendo sessão/perfil
  | "deslogado" // sem sessão
  | "sem_perfil" // sessão válida mas sem empresa vinculada
  | "operador" // super_admin (operador da plataforma) — sem tenant (Marco F)
  | "pronto"; // sessão + perfil resolvidos

interface AuthState {
  status: AuthStatus;
  session: Session | null;
  perfil: Usuario | null;
  empresa: Empresa | null;
  superAdmin: boolean;
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
  // Recuperação de senha (Marco H).
  /** true quando o link de recuperação abriu o app (hash type=recovery). */
  recoveryMode: boolean;
  /** código de erro do link (ex.: 'otp_expired') quando o link falhou. */
  recoveryErro: string | null;
  enviarResetSenha: (email: string) => Promise<{ error: string | null }>;
  redefinirSenha: (novaSenha: string) => Promise<{ error: string | null }>;
  /** limpa o estado de recovery + o hash da URL. */
  limparRecovery: () => void;
}

/** Lê o hash da URL na carga (determinístico, evita race com o evento). */
function lerHashAuth(): { recovery: boolean; erro: string | null } {
  if (typeof window === "undefined") return { recovery: false, erro: null };
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const erro = h.get("error_code") || h.get("error");
  if (erro) return { recovery: false, erro };
  return { recovery: h.get("type") === "recovery", erro: null };
}

/** Remove o hash da URL (token/erro) sem recarregar a página. */
function limparHashUrl(): void {
  if (typeof window !== "undefined" && window.location.hash) {
    window.history.replaceState({}, "", window.location.pathname + window.location.search);
  }
}

const AuthContext = createContext<AuthState | null>(null);

/** Busca a empresa tolerando bases sem a coluna trial_expira_em (pré-migration 0006). */
async function buscarEmpresa(empresaId: string): Promise<Empresa | null> {
  const full = await supabase
    .from("empresas")
    .select(
      "id, nome, plano, trial_expira_em, stripe_customer_id, stripe_subscription_id, assinatura_ativa_ate, cortesia_ate, prazos_nc, logo_url, criado_em",
    )
    .eq("id", empresaId)
    .maybeSingle();
  if (!full.error) return (full.data as Empresa) ?? null;

  // Fallback p/ bases sem as colunas de assinatura (pré-0008).
  const base = await supabase
    .from("empresas")
    .select("id, nome, plano, criado_em")
    .eq("id", empresaId)
    .maybeSingle();
  if (base.error || !base.data) return null;
  return {
    ...(base.data as Pick<Empresa, "id" | "nome" | "plano" | "criado_em">),
    trial_expira_em: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    assinatura_ativa_ate: null,
  };
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
  const [superAdmin, setSuperAdmin] = useState(false);
  const hashInicial = lerHashAuth();
  const [recoveryMode, setRecoveryMode] = useState(hashInicial.recovery);
  const [recoveryErro, setRecoveryErro] = useState<string | null>(hashInicial.erro);
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
        setSuperAdmin(false);
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
        // Sem tenant: pode ser um operador da plataforma (super_admin, Marco F).
        const { data: souOp } = await supabase.rpc("eh_super_admin");
        if (!atual()) return;
        setPerfil(null);
        setEmpresa(null);
        if (souOp === true) {
          setSuperAdmin(true);
          setStatus("operador");
        } else {
          setSuperAdmin(false);
          setStatus("sem_perfil");
        }
        return;
      }
      setPerfil(u as Usuario);
      setSuperAdmin(false);
      const e = await buscarEmpresa(u.empresa_id);
      if (!atual()) return;
      setEmpresa(e);
      setStatus("pronto");
    } catch {
      if (atual()) {
        setPerfil(null);
        setEmpresa(null);
        setSuperAdmin(false);
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
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Link de recuperação abriu o app → força a tela de redefinição (Marco H).
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
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
      superAdmin,
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
        // Remove o token de push deste dispositivo antes de sair (best-effort).
        await desativarPush();
        await supabase.auth.signOut();
      },
      recoveryMode,
      recoveryErro,
      async enviarResetSenha(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin,
        });
        return { error: error ? traduzErro(error.message) : null };
      },
      async redefinirSenha(novaSenha) {
        const { error } = await supabase.auth.updateUser({ password: novaSenha });
        if (error) return { error: traduzErro(error.message) };
        setRecoveryMode(false);
        limparHashUrl();
        return { error: null };
      },
      limparRecovery() {
        setRecoveryMode(false);
        setRecoveryErro(null);
        limparHashUrl();
      },
    }),
    [status, session, perfil, empresa, superAdmin, recoveryMode, recoveryErro, resolver],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}
