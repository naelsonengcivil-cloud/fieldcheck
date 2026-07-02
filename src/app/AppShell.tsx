import { useState } from "react";
import { Botao, Card, Header, Kpi } from "@/components/ui";
import { SyncBar } from "@/components/SyncBar";
import { T, FONT_HEAD } from "@/theme";
import { useAuth } from "@/features/auth/AuthProvider";
import { useSync } from "@/features/sync/SyncProvider";
import { db } from "@/lib/db";
import { salvarInspecaoLocal, type ExecInspecao } from "@/lib/inspecaoService";
import { NovaInspecao } from "@/features/inspecao/NovaInspecao";
import { Execucao } from "@/features/inspecao/Execucao";
import { Resumo } from "@/features/inspecao/Resumo";

// ============================================================
// Shell autenticado + navegação das telas de inspeção (M5).
// home → nova → exec → resumo → (salva offline) → home
// Home real (obras + KPIs) e telas de obra/detalhe chegam no M6.
// ============================================================

type Tela = "home" | "nova" | "exec" | "resumo";

const PAPEL_LABEL: Record<string, string> = {
  inspetor: "Inspetor",
  gestor: "Gestor",
  admin: "Administrador",
};

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
  const { perfil, empresa, signOut } = useAuth();
  const { sincronizarAgora } = useSync();
  const [tela, setTela] = useState<Tela>("home");
  const [exec, setExec] = useState<ExecInspecao | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

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

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        background: T.bg,
        minHeight: "100vh",
        maxWidth: 520,
        margin: "0 auto",
        color: T.ink,
      }}
    >
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

      <Header
        titulo="FieldCheck"
        sub={empresa ? empresa.nome : "Inspeções de campo"}
        right={
          <button
            onClick={() => void signOut()}
            style={{
              background: "rgba(255,255,255,0.12)",
              border: "none",
              color: "#fff",
              padding: "8px 12px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: FONT_HEAD,
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}
          >
            Sair
          </button>
        }
      />
      <SyncBar />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <Botao onClick={() => setTela("nova")}>+ Nova inspeção</Botao>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Kpi label="Inspeções" valor="—" cor={T.navy} />
          <Kpi label="NCs" valor="—" cor={T.green} />
          <Kpi label="% Conform." valor="—" cor={T.green} />
        </div>

        <Card>
          <div
            style={{
              fontFamily: FONT_HEAD,
              fontWeight: 700,
              fontSize: 16,
              textTransform: "uppercase",
              color: T.inkSoft,
              marginBottom: 6,
            }}
          >
            Sessão ativa
          </div>
          <div style={{ fontSize: 14.5, lineHeight: 1.6 }}>
            <div>
              <b>{perfil?.nome}</b>
            </div>
            <div style={{ color: T.inkSoft }}>
              {PAPEL_LABEL[perfil?.papel ?? ""] ?? perfil?.papel} · {empresa?.nome}
            </div>
          </div>
          <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 10, lineHeight: 1.5 }}>
            Home com obras e KPIs reais chega no M6. Por ora, use “+ Nova
            inspeção” para executar e salvar offline.
          </div>
        </Card>
      </div>
    </div>
  );
}
