import { lazy, Suspense, useEffect, useState } from "react";
import { T } from "@/theme";
import { Container } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { useSync } from "@/features/sync/SyncProvider";
import { db, type LocalInspecao, type LocalOcorrencia } from "@/lib/db";
import { salvarInspecaoLocal, type ExecInspecao } from "@/lib/inspecaoService";
import { salvarOcorrenciaLocal, atualizarOcorrenciaLocal, type DadosOcorrencia } from "@/lib/ocorrenciaService";
import { obterLocalizacao } from "@/lib/plataforma";
import { Home } from "@/features/obra/Home"; // eager: landing (não-executora)
import { ExecutoraHome } from "@/features/executora/ExecutoraHome"; // eager: landing (executora)
import { processarRncPendentes, enfileirarRnc } from "@/lib/rncService";
import { ativarPush, aoAbrirNc } from "@/lib/push";
import { usePlano } from "@/features/planos/PlanoProvider";
import { ModalUpgrade } from "@/features/planos/ModalUpgrade";
import { type Feature } from "@/lib/planos";
import type { Obra, Rnc } from "@/types/db";

// Code-splitting (v1.0): cada tela vira um chunk sob demanda. O landing
// (Home/ExecutoraHome) fica eager para não piscar ao abrir o app.
const NovaOcorrencia = lazy(() =>
  import("@/features/ocorrencia/NovaOcorrencia").then((m) => ({ default: m.NovaOcorrencia })),
);
const NovaDesvio = lazy(() =>
  import("@/features/ocorrencia/NovaDesvio").then((m) => ({ default: m.NovaDesvio })),
);
const PainelSync = lazy(() =>
  import("@/features/sync/PainelSync").then((m) => ({ default: m.PainelSync })),
);
const TelaSeguranca = lazy(() =>
  import("@/features/seguranca/TelaSeguranca").then((m) => ({ default: m.TelaSeguranca })),
);
const TelaPerfil = lazy(() =>
  import("@/features/perfil/TelaPerfil").then((m) => ({ default: m.TelaPerfil })),
);
const NovaInspecao = lazy(() =>
  import("@/features/inspecao/NovaInspecao").then((m) => ({ default: m.NovaInspecao })),
);
const Execucao = lazy(() =>
  import("@/features/inspecao/Execucao").then((m) => ({ default: m.Execucao })),
);
const Resumo = lazy(() => import("@/features/inspecao/Resumo").then((m) => ({ default: m.Resumo })));
const TelaObra = lazy(() =>
  import("@/features/obra/TelaObra").then((m) => ({ default: m.TelaObra })),
);
const Detalhe = lazy(() =>
  import("@/features/inspecao/Detalhe").then((m) => ({ default: m.Detalhe })),
);
const GestaoUsuarios = lazy(() =>
  import("@/features/admin/GestaoUsuarios").then((m) => ({ default: m.GestaoUsuarios })),
);
const GestaoObras = lazy(() =>
  import("@/features/admin/GestaoObras").then((m) => ({ default: m.GestaoObras })),
);
const GestaoContratadas = lazy(() =>
  import("@/features/admin/GestaoContratadas").then((m) => ({ default: m.GestaoContratadas })),
);
const GestaoChecklists = lazy(() =>
  import("@/features/admin/GestaoChecklists").then((m) => ({ default: m.GestaoChecklists })),
);
const GestaoKits = lazy(() =>
  import("@/features/admin/GestaoKits").then((m) => ({ default: m.GestaoKits })),
);
const ConfigPrazos = lazy(() =>
  import("@/features/admin/ConfigPrazos").then((m) => ({ default: m.ConfigPrazos })),
);
const IdentidadeVisual = lazy(() =>
  import("@/features/admin/IdentidadeVisual").then((m) => ({ default: m.IdentidadeVisual })),
);
const ConfigIA = lazy(() =>
  import("@/features/admin/ConfigIA").then((m) => ({ default: m.ConfigIA })),
);
const TelaAlertas = lazy(() =>
  import("@/features/alertas/TelaAlertas").then((m) => ({ default: m.TelaAlertas })),
);
const RelatorioGeral = lazy(() =>
  import("@/features/obra/RelatorioGeral").then((m) => ({ default: m.RelatorioGeral })),
);
const TelaDashboard = lazy(() =>
  import("@/features/obra/TelaDashboard").then((m) => ({ default: m.TelaDashboard })),
);
const TelaBancoExperiencia = lazy(() =>
  import("@/features/obra/TelaBancoExperiencia").then((m) => ({ default: m.TelaBancoExperiencia })),
);
const TelaRnc = lazy(() => import("@/features/rnc/TelaRnc").then((m) => ({ default: m.TelaRnc })));
const TelaNotificacoes = lazy(() =>
  import("@/features/notificacoes/TelaNotificacoes").then((m) => ({ default: m.TelaNotificacoes })),
);
const TelaPlano = lazy(() =>
  import("@/features/plano/TelaPlano").then((m) => ({ default: m.TelaPlano })),
);

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
  | "checklists"
  | "kits"
  | "prazos"
  | "identidade"
  | "configIA"
  | "alertas"
  | "relatorioGeral"
  | "dashboard"
  | "bancoExperiencia"
  | "rnc"
  | "notificacoes"
  | "ocorrencia"
  | "desvio"
  | "sync_painel"
  | "seguranca"
  | "perfil"
  | "plano";

// Fallback enquanto um chunk de tela carrega (raro após o 1º precache do PWA).
function CarregandoTela() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: T.inkSoft,
        fontSize: 14,
      }}
    >
      Carregando…
    </div>
  );
}

export function AppShell() {
  const { perfil, empresa, recarregarPerfil } = useAuth();
  const { sincronizarAgora } = useSync();
  const gate = usePlano();
  const [tela, setTela] = useState<Tela>("home");
  // Roteia para uma tela SE a feature está liberada; senão, abre a vitrine
  // (centralizada no PlanoProvider). O enforcement real é server-side.
  const irComFeature = (feature: Feature, destino: Tela, nome: string, oQueFaz: string) =>
    gate.temFeature(feature) ? setTela(destino) : gate.pedirUpgrade(feature, nome, oQueFaz);
  const [exec, setExec] = useState<ExecInspecao | null>(null);
  const [obraSel, setObraSel] = useState<Obra | null>(null);
  const [verInsp, setVerInsp] = useState<LocalInspecao | null>(null);
  const [rncSel, setRncSel] = useState<Rnc | null>(null);
  const [origemDetalhe, setOrigemDetalhe] = useState<Tela>("obra");
  const [salvando, setSalvando] = useState(false);
  const [salvandoOcor, setSalvandoOcor] = useState(false);
  // Obra de origem quando "Registrar desvio" nasce de dentro dela (Marco M).
  const [desvioObra, setDesvioObra] = useState<string | null>(null);
  // Desvio em edição (Frente 2) — quando setado, a tela "desvio" edita em vez de criar.
  const [desvioEdit, setDesvioEdit] = useState<LocalOcorrencia | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Retorno de checkout: aguardando o webhook refletir o plano pago (condição 2).
  const [aguardandoPlano, setAguardandoPlano] = useState(false);

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
      setAguardandoPlano(true);
      void recarregarPerfil(); // o webhook atualiza o plano
    } else {
      toast("Pagamento não concluído.", 3500);
    }
  }, [recarregarPerfil]);

  // Condição 2: revalida o plano em intervalos até o webhook refletir, para o
  // cliente recém-pago nunca ver cadeado. Para quando o plano vira pago (ou timeout).
  useEffect(() => {
    if (!aguardandoPlano) return;
    const pago = !!empresa && ["basic", "premium", "intelligence"].includes(empresa.plano as string);
    if (pago) {
      setAguardandoPlano(false);
      toast("Plano ativado ✓", 3000);
      return;
    }
    const iv = setInterval(() => void recarregarPerfil(), 2500);
    const stop = setTimeout(() => setAguardandoPlano(false), 20000);
    return () => {
      clearInterval(iv);
      clearTimeout(stop);
    };
  }, [aguardandoPlano, empresa, recarregarPerfil]);

  // Gera RNCs enfileiradas offline assim que houver rede (Marco RNC).
  useEffect(() => {
    const drenar = () => void processarRncPendentes().catch(() => {});
    drenar();
    window.addEventListener("online", drenar);
    return () => window.removeEventListener("online", drenar);
  }, []);

  // Bloqueio suave: em somente-leitura/arquivada, criar inspeção abre a vitrine
  // (reativar). Nos demais tiers (inclui trial → Intelligence) segue normal.
  function abrirNova() {
    if (gate.tier === "readonly" || gate.tier === "archived") {
      gate.tratarErroUpgrade("reativar");
      return;
    }
    setTela("nova");
  }

  async function salvar(assinatura: string | null, gerarRncs = false) {
    if (!exec || !perfil) return;
    setSalvando(true);
    try {
      const geo = await obterLocalizacao();
      const inspecaoId = await salvarInspecaoLocal(db, { ...exec, assinatura: assinatura ?? "" }, {
        empresaId: perfil.empresa_id,
        inspetorId: perfil.id,
        finalizadaEm: new Date().toISOString(),
        geo,
      });
      setExec(null);
      setTela("home");
      setAviso("Inspeção salva ✓");
      setTimeout(() => setAviso(null), 2500);
      // "Gerar todas as RNCs": enfileira cada NC e gera após o sync (a Edge
      // Function precisa das respostas já no servidor). Roda em background.
      if (gerarRncs) {
        void (async () => {
          const rs = await db.respostas.where("inspecao_id").equals(inspecaoId).toArray();
          for (const r of rs) if (r.resposta === "NC") await enfileirarRnc({ resposta_item_id: r.id });
          await sincronizarAgora();
          const n = await processarRncPendentes();
          if (n > 0) toast(`${n} RNC(s) gerada(s) ✓`, 4000);
        })();
      } else {
        void sincronizarAgora(); // best-effort; se offline, fica na fila
      }
    } catch (e) {
      setAviso((e as Error)?.message ?? "Falha ao salvar");
      setTimeout(() => setAviso(null), 4000);
    } finally {
      setSalvando(false);
    }
  }

  async function salvarOcorrencia(dados: DadosOcorrencia, opts?: { desvio?: boolean }) {
    if (!perfil) return;
    const ctx = { empresaId: perfil.empresa_id, criadoPor: perfil.id };
    setSalvandoOcor(true);
    try {
      if (desvioEdit) {
        await atualizarOcorrenciaLocal(desvioEdit.id, dados, ctx); // Frente 2 (edição)
      } else {
        await salvarOcorrenciaLocal(dados, ctx);
      }
      const editava = !!desvioEdit;
      setDesvioEdit(null);
      // Desvio (novo ou editado) volta para a obra de origem; ocorrência → Home.
      setTela((opts?.desvio || editava) && desvioObra ? "obra" : "home");
      toast(editava ? "Desvio atualizado ✓" : opts?.desvio ? "Desvio registrado ✓" : "Ocorrência registrada ✓");
      void sincronizarAgora();
    } catch (e) {
      toast((e as Error)?.message ?? "Falha ao salvar", 4000);
    } finally {
      setSalvandoOcor(false);
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

  // Push (RF12): registra o toque numa notificação de NC → abre o detalhe.
  useEffect(() => {
    aoAbrirNc((eventoId) => void abrirNc(eventoId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push (RF12): registra o dispositivo ao logar. No web só renova o token se
  // a permissão já foi concedida (o prompt vem do botão em Perfil).
  useEffect(() => {
    if (!perfil?.id) return;
    void ativarPush(false);
  }, [perfil?.id]);

  // Web: toque na notificação (SW) abre o app em /?nc=<evento_id>.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const nc = p.get("nc");
    if (!nc) return;
    window.history.replaceState({}, "", window.location.pathname);
    void abrirNc(nc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cada tela é um chunk lazy; renderTela() computa a atual e o <Suspense>
  // abaixo cobre o carregamento sob demanda (fallback = tela "Carregando…").
  function renderTela() {
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
        onSalvar={(assinatura, gerarRncs) => void salvar(assinatura, gerarRncs)}
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
        onRegistrarDesvio={() => {
          setDesvioObra(obraSel.id);
          setDesvioEdit(null);
          irComFeature("bird_pyramid", "desvio", "Registrar desvio",
            "Registro rápido de ato inseguro, condição insegura e quase-acidente — a base da Pirâmide de Bird.");
        }}
        onEditarDesvio={(o) => {
          setDesvioObra(o.obra_id);
          setDesvioEdit(o);
          setTela("desvio");
        }}
      />
    );
  }
  if (tela === "detalhe" && verInsp) {
    return (
      <Detalhe
        insp={verInsp}
        onBack={() => setTela(origemDetalhe)}
        onAbrirRnc={(rnc) => {
          setRncSel(rnc);
          setTela("rnc");
        }}
      />
    );
  }
  if (tela === "rnc" && rncSel) {
    return <TelaRnc rnc={rncSel} onVoltar={() => setTela("detalhe")} />;
  }
  if (tela === "notificacoes") {
    return <TelaNotificacoes onBack={() => setTela("home")} onVerNc={(id) => void abrirNc(id)} />;
  }
  if (tela === "ocorrencia") {
    return (
      <NovaOcorrencia
        onBack={() => setTela("home")}
        onSalvar={(d) => void salvarOcorrencia(d)}
        salvando={salvandoOcor}
      />
    );
  }
  if (tela === "desvio") {
    return (
      <NovaDesvio
        obraInicial={desvioObra}
        desvioExistente={desvioEdit}
        onBack={() => { setDesvioEdit(null); setTela(desvioObra ? "obra" : "home"); }}
        onSalvar={(d) => void salvarOcorrencia(d, { desvio: true })}
        salvando={salvandoOcor}
      />
    );
  }
  if (tela === "sync_painel") {
    return <PainelSync onBack={() => setTela("home")} />;
  }
  if (tela === "seguranca") {
    return <TelaSeguranca onBack={() => setTela("home")} />;
  }
  if (tela === "perfil") {
    return <TelaPerfil onBack={() => setTela("home")} />;
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
  if (tela === "checklists") {
    return <GestaoChecklists onBack={() => setTela("home")} />;
  }
  if (tela === "kits") {
    return <GestaoKits onBack={() => setTela("home")} />;
  }
  if (tela === "prazos") {
    return <ConfigPrazos onBack={() => setTela("home")} />;
  }
  if (tela === "identidade") {
    return <IdentidadeVisual onBack={() => setTela("home")} />;
  }
  if (tela === "configIA") {
    return <ConfigIA onBack={() => setTela("home")} />;
  }
  if (tela === "alertas") {
    return <TelaAlertas onVoltar={() => setTela("home")} />;
  }
  if (tela === "relatorioGeral") {
    return <RelatorioGeral onVoltar={() => setTela("home")} />;
  }
  if (tela === "dashboard") {
    return <TelaDashboard onVoltar={() => setTela("home")} />;
  }
  if (tela === "bancoExperiencia") {
    return <TelaBancoExperiencia onVoltar={() => setTela("home")} />;
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
          onAbrirPerfil={() => setTela("perfil")}
          onAbrirSync={() => setTela("sync_painel")}
        />
      ) : (
      <Home
        onNova={abrirNova}
        onNovoDesvio={() => {
          setDesvioObra(null);
          irComFeature("bird_pyramid", "desvio", "Registrar desvio",
            "Registro rápido de ato inseguro, condição insegura e quase-acidente — a base da Pirâmide de Bird.");
        }}
        onNovaOcorrencia={() =>
          irComFeature("bird_pyramid", "ocorrencia", "Registrar ocorrência",
            "Registro de danos e acidentes que alimentam a Pirâmide de Bird.")
        }
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
        onGerenciarChecklists={
          perfil?.papel === "admin" ? () => setTela("checklists") : undefined
        }
        onGerenciarKits={
          perfil?.papel === "admin" ? () => setTela("kits") : undefined
        }
        onConfigPrazos={
          perfil?.papel === "admin" ? () => setTela("prazos") : undefined
        }
        onIdentidade={
          perfil?.papel === "admin" ? () => setTela("identidade") : undefined
        }
        onConfigIA={
          perfil?.papel === "admin" ? () => setTela("configIA") : undefined
        }
        onRelatorioGeral={
          perfil?.papel === "admin" || perfil?.papel === "gestor"
            ? () => irComFeature("multi_project_reports", "relatorioGeral", "Relatórios consolidados",
                "Relatórios gerenciais consolidados de várias obras num só lugar.")
            : undefined
        }
        onDashboard={
          perfil?.papel === "admin" || perfil?.papel === "gestor"
            ? () => irComFeature("bi_full", "dashboard", "Dashboard analítico",
                "Painéis de conformidade, reincidência e desempenho de contratadas (RF19).")
            : undefined
        }
        onBancoExperiencia={
          perfil?.papel === "admin" || perfil?.papel === "gestor"
            ? () => irComFeature("bi_dashboard_summary", "bancoExperiencia", "Banco de experiência",
                "Frequências históricas de NC por item e tempos médios de tratamento.")
            : undefined
        }
        onAlertas={
          perfil?.papel === "admin" || perfil?.papel === "gestor"
            ? () => irComFeature("smart_alerts", "alertas", "Alertas inteligentes",
                "Detecta NCs vencidas, reincidência e degradação de contratadas e explica com IA.")
            : undefined
        }
        onSeguranca={
          perfil?.papel === "admin" || perfil?.papel === "gestor"
            ? () => irComFeature("bird_pyramid", "seguranca", "Segurança & Pirâmide de Bird",
                "Pirâmide de Bird e registro de ocorrências e quase-acidentes.")
            : undefined
        }
        onAbrirPerfil={() => setTela("perfil")}
        onPlano={() => setTela("plano")}
        ativandoPlano={aguardandoPlano}
        onAbrirSync={() => setTela("sync_painel")}
      />
      )}
    </>
  );
  }

  // Frame responsivo (v1.0): coluna estreita por padrão; telas de painel usam
  // largura ampla (grade). No mobile o Container é 100% (sem efeito).
  const telasWide = new Set<Tela>(["dashboard", "home", "obra", "bancoExperiencia", "alertas"]);
  return (
    <Suspense fallback={<CarregandoTela />}>
      <Container wide={telasWide.has(tela)}>{renderTela()}</Container>
      {gate.pedido && (
        <ModalUpgrade
          titulo={gate.pedido.titulo}
          corpo={gate.pedido.corpo}
          planoAlvo={gate.pedido.planoAlvo}
          onVerPlanos={() => { gate.fecharUpgrade(); setTela("plano"); }}
          onFechar={gate.fecharUpgrade}
        />
      )}
    </Suspense>
  );
}
