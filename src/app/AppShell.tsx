import { useEffect, useState } from "react";
import { T } from "@/theme";
import { useAuth } from "@/features/auth/AuthProvider";
import { useSync } from "@/features/sync/SyncProvider";
import { db, type LocalInspecao } from "@/lib/db";
import { salvarInspecaoLocal, type ExecInspecao } from "@/lib/inspecaoService";
import { NovaInspecao } from "@/features/inspecao/NovaInspecao";
import { Execucao } from "@/features/inspecao/Execucao";
import { Resumo } from "@/features/inspecao/Resumo";
import { Home } from "@/features/obra/Home";
import { ExecutoraHome } from "@/features/executora/ExecutoraHome";
import { TelaObra } from "@/features/obra/TelaObra";
import { Detalhe } from "@/features/inspecao/Detalhe";
import { GestaoUsuarios } from "@/features/admin/GestaoUsuarios";
import { GestaoObras } from "@/features/admin/GestaoObras";
import { GestaoContratadas } from "@/features/admin/GestaoContratadas";
import { TelaNotificacoes } from "@/features/notificacoes/TelaNotificacoes";
import { TelaPlano } from "@/features/plano/TelaPlano";
import { statusPlano } from "@/lib/plano";
import type { Obra } from "@/types/db";

// ============================================================
// Shell autenticado + navegação (M5/M6).
// home → nova → exec → resumo → (salva offline) → home
// home → obra → detalhe (somente leitura)
// ============================================================

type Tela =
  | "home"
  | "nova"
  | "exec"
  | "resumo"
  | "obra"
  | "detalhe"
  | "usuarios"
  | "obras"
  | "contratadas"
  | "notificacoes"
  | "plano";

/** Geolocalização best-effort (não bloqueia o salvamento). */
function obterGeo(): Promise<{ lat: number | null; lng: number | null }> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ lat: null, lng: null });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve({ lat: null, lng: null }),
      { timeout: 4000, maximumAge: 60_000 },
    );
  });
}

export function AppShell() {
  const { perfil, empresa, recarregarPerfil } = useAuth();
  const { sincronizarAgora } = useSync();
  const [tela, setTela] = useState<Tela>("home");
  const [exec, setExec] = useState<ExecInspecao | null>(null);
  const [obraSel, setObraSel] = useState<Obra | null>(null);
  const [verInsp, setVerInsp] = useState<LocalInspecao | null>(null);
  const [origemDetalhe, setOrigemDetalhe] = useState<Tela>("obra");
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const plano = statusPlano(empresa);
  const ehExecutora = perfil?.papel === "executora";

  function toast(msg: string, ms = 2500) {
    setAviso(msg);
    setTimeout(() => setAviso(null), ms);
  }

  // Retorno do Stripe Checkout (?assinatura=ok|cancelada).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const a = p.get("assinatura");
    if (!a) return;
    window.history.replaceState({}, "", window.location.pathname);
    if (a === "ok") {
      toast("Pagamento recebido — ativando seu plano…", 4000);
      void recarregarPerfil(); // o webhook atualiza o plano
    } else {
      toast("Pagamento não concluído.", 3500);
    }
  }, [recarregarPerfil]);

  // Bloqueio suave (RF16): sem liberação, criar inspeção leva ao plano.
  function abrirNova() {
    if (!plano.liberada) {
      toast("Assine para criar novas inspeções.", 3500);
      setTela("plano");
      return;
    }
    setTela("nova");
  }

  async function salvar() {
    if (!exec || !perfil) return;
    setSalvando(true);
    try {
      const geo = await obterGeo();
      await salvarInspecaoLocal(db, exec, {
        empresaId: perfil.empresa_id,
        inspetorId: perfil.id,
        finalizadaEm: new Date().toISOString(),
        geo,
      });
      setExec(null);
      setTela("home");
      setAviso("Inspeção salva ✓");
      setTimeout(() => setAviso(null), 2500);
      void sincronizarAgora(); // best-effort; se offline, fica na fila
    } catch (e) {
      setAviso((e as Error)?.message ?? "Falha ao salvar");
      setTimeout(() => setAviso(null), 4000);
    } finally {
      setSalvando(false);
    }
  }

  // Abre o detalhe da inspeção a partir de uma notificação de NC.
  async function abrirNc(eventoId: string) {
    const ev = await db.eventos.get(eventoId);
    const resp = ev ? await db.respostas.get(ev.resposta_id) : undefined;
    const insp = resp ? await db.inspecoes.get(resp.inspecao_id) : undefined;
    if (insp) {
      setVerInsp(insp);
      setOrigemDetalhe("notificacoes");
      setTela("detalhe");
    } else {
      setTela("home"); // NC não está mais no cache (excluída/fora do escopo)
    }
  }

  if (tela === "nova") {
    return (
      <NovaInspecao
        onBack={() => setTela("home")}
        onIniciar={(e) => {
          setExec(e);
          setTela("exec");
        }}
      />
    );
  }
  if (tela === "exec" && exec) {
    return (
      <Execucao
        execInicial={exec}
        onBack={() => setTela("nova")}
        onFinalizar={(e) => {
          setExec(e);
          setTela("resumo");
        }}
      />
    );
  }
  if (tela === "resumo" && exec) {
    return (
      <Resumo
        exec={exec}
        onBack={() => setTela("exec")}
        onSalvar={() => void salvar()}
        salvando={salvando}
      />
    );
  }
  if (tela === "obra" && obraSel) {
    return (
      <TelaObra
        obra={obraSel}
        onBack={() => setTela("home")}
        onVerInspecao={(insp) => {
          setVerInsp(insp);
          setOrigemDetalhe("obra");
          setTela("detalhe");
        }}
      />
    );
  }
  if (tela === "detalhe" && verInsp) {
    return <Detalhe insp={verInsp} onBack={() => setTela(origemDetalhe)} />;
  }
  if (tela === "notificacoes") {
    return <TelaNotificacoes onBack={() => setTela("home")} onVerNc={(id) => void abrirNc(id)} />;
  }
  if (tela === "usuarios") {
    return <GestaoUsuarios onBack={() => setTela("home")} />;
  }
  if (tela === "obras") {
    return <GestaoObras onBack={() => setTela("home")} />;
  }
  if (tela === "contratadas") {
    return <GestaoContratadas onBack={() => setTela("home")} />;
  }
  if (tela === "plano") {
    return <TelaPlano onBack={() => setTela("home")} />;
  }

  return (
    <>
      {aviso && (
        <div
          role="status"
          style={{
            position: "fixed",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 50,
            maxWidth: 460,
            width: "calc(100% - 28px)",
            padding: "12px 16px",
            borderRadius: 12,
            background: T.green,
            color: "#fff",
            fontWeight: 700,
            fontSize: 14,
            textAlign: "center",
            boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
          }}
        >
          {aviso}
        </div>
      )}
      {ehExecutora ? (
        <ExecutoraHome
          onVerInspecao={(insp) => {
            setVerInsp(insp);
            setOrigemDetalhe("home");
            setTela("detalhe");
          }}
          onAbrirNotificacoes={() => setTela("notificacoes")}
        />
      ) : (
      <Home
        onNova={abrirNova}
        onAbrirObra={(o) => {
          setObraSel(o);
          setTela("obra");
        }}
        onAbrirNotificacoes={() => setTela("notificacoes")}
        onGerenciarUsuarios={
          perfil?.papel === "admin" ? () => setTela("usuarios") : undefined
        }
        onGerenciarObras={
          perfil?.papel === "admin" ? () => setTela("obras") : undefined
        }
        onGerenciarContratadas={
          perfil?.papel === "admin" || perfil?.papel === "gestor"
            ? () => setTela("contratadas")
            : undefined
        }
        onPlano={() => setTela("plano")}
        plano={plano}
      />
      )}
    </>
  );
}
