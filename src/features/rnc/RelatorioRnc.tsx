import { useEffect, useState } from "react";
import { Botao } from "@/components/ui";
import { FONT_BODY, FONT_HEAD } from "@/theme";
import { supabase } from "@/lib/supabase";
import { CabecalhoRelatorio } from "@/features/relatorio/CabecalhoRelatorio";
import { ROTULO_GRAVIDADE, corGravidade } from "@/lib/rncService";
import type { Rnc, NcTransicao, StatusEvento } from "@/types/db";

// ============================================================
// PDF individual da RNC (melhoria 3) — documento formal para o cliente.
// Identidade padrão (logo da empresa no cabeçalho, FieldCheck discreto no
// rodapé), as 4 seções normativas, fotos, histórico de tratamento e
// assinatura quando houver. window.print() → "Salvar como PDF".
// ============================================================

export interface CtxRnc {
  obra: string;
  cliente: string;
  contratada: string;
  data: string; // dd/mm/aaaa da inspeção de origem
  inspetor: string;
  checklistNome: string;
  itemTexto: string;
  criterio: string;
}

const ROTULO_STATUS_EV: Record<StatusEvento, string> = {
  aberto: "Aberta",
  em_andamento: "Em tratamento",
  tratada: "Tratada (aguardando aprovação)",
  aprovada: "Aprovada / encerrada",
  reaberta: "Reaberta",
  fechado: "Fechada",
};

const br = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function RelatorioRnc({
  rnc,
  ctx,
  empresaNome,
  logoUrl,
  assinatura,
  onVoltar,
}: {
  rnc: Rnc;
  ctx: CtxRnc;
  empresaNome: string;
  logoUrl?: string | null;
  assinatura?: string | null; // PNG data URL da assinatura do inspetor (se houver)
  onVoltar: () => void;
}) {
  const [fotos, setFotos] = useState<string[]>([]);
  const [fotosCorr, setFotosCorr] = useState<string[]>([]);
  const [historico, setHistorico] = useState<NcTransicao[]>([]);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const assinar = async (paths: string[]) => {
        const urls: string[] = [];
        for (const p of paths) {
          const { data } = await supabase.storage.from("evidencias").createSignedUrl(p, 3600);
          if (data?.signedUrl) urls.push(data.signedUrl);
        }
        return urls;
      };
      const [f, fc] = await Promise.all([assinar(rnc.fotos ?? []), assinar(rnc.fotos_correcao ?? [])]);
      // Histórico de tratamento: evento da resposta de origem → nc_transicoes.
      let hist: NcTransicao[] = [];
      const { data: ev } = await supabase
        .from("eventos_nc")
        .select("id")
        .eq("resposta_id", rnc.resposta_item_id)
        .maybeSingle();
      if (ev?.id) {
        const { data: trs } = await supabase
          .from("nc_transicoes")
          .select("*")
          .eq("evento_id", ev.id)
          .order("criado_em", { ascending: true });
        hist = (trs ?? []) as NcTransicao[];
      }
      if (vivo) {
        setFotos(f);
        setFotosCorr(fc);
        setHistorico(hist);
        setPronto(true);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [rnc]);

  const cg = corGravidade(rnc.gravidade);
  const sec = rnc.secoes_final;

  return (
    <div style={{ padding: "24px 24px 56px", fontFamily: FONT_BODY, color: "#111", background: "#fff", minHeight: "100vh" }}>
      <div className="no-print" style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <Botao onClick={() => { try { window.print(); } catch { /* sem impressão */ } }} style={{ width: "auto" }} disabled={!pronto}>
          {pronto ? "Imprimir / Salvar PDF" : "Preparando…"}
        </Botao>
        <Botao variante="fantasma" onClick={onVoltar} style={{ width: "auto" }}>
          Voltar
        </Botao>
      </div>

      <CabecalhoRelatorio
        empresaNome={empresaNome}
        logoUrl={logoUrl}
        titulo={`RNC ${rnc.numero}`}
        subtitulo="Relatório de Não Conformidade"
        inspetores={[ctx.inspetor]}
        metaLinha={`Obra: ${ctx.obra}${ctx.cliente ? ` · Cliente: ${ctx.cliente}` : ""} · Emitido em ${new Date().toLocaleDateString("pt-BR")}`}
      />

      {/* Identificação */}
      <Bloco titulo="Identificação">
        <Grade>
          <Campo r="Obra" v={ctx.obra} />
          <Campo r="Contratada" v={ctx.contratada || "—"} />
          <Campo r="Checklist" v={`${rnc.checklist_codigo} · ${ctx.checklistNome}`} />
          <Campo r="Item nº" v={`${rnc.item_numero} — ${ctx.itemTexto}`} />
          <Campo r="Local" v={rnc.local || "—"} />
          <Campo r="Ativo/Equipamento" v={rnc.ativo || "—"} />
          <Campo r="Data da inspeção" v={ctx.data || "—"} />
          <Campo
            r="Gravidade"
            v={<span style={{ color: cg.fg, fontWeight: 700 }}>{ROTULO_GRAVIDADE[rnc.gravidade]}</span>}
          />
          <Campo r="Prazo (dias)" v={rnc.prazo_dias != null ? String(rnc.prazo_dias) : "—"} />
          <Campo r="Responsável" v={rnc.responsavel || "—"} />
        </Grade>
      </Bloco>

      <Bloco titulo="Descrição da não conformidade">
        <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{rnc.descricao_nc || "—"}</p>
        {ctx.criterio && (
          <p style={{ margin: "6px 0 0", color: "#555", fontSize: 12.5 }}>
            <b>Critério do item:</b> {ctx.criterio}
          </p>
        )}
      </Bloco>

      <Bloco titulo="Requisito descumprido">
        <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{sec.requisito || "—"}</p>
      </Bloco>
      <Bloco titulo="Fundamentação técnica">
        <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{sec.fundamentacao || "—"}</p>
      </Bloco>
      <Bloco titulo="Risco / consequência">
        <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{sec.risco || "—"}</p>
        {rnc.risco_complementar && <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{rnc.risco_complementar}</p>}
      </Bloco>
      <Bloco titulo="Ação corretiva recomendada">
        <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{sec.acao || "—"}</p>
        {rnc.acao_complementar && <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{rnc.acao_complementar}</p>}
      </Bloco>

      {fotos.length > 0 && (
        <Bloco titulo="Evidências (abertura)">
          <Galeria urls={fotos} />
        </Bloco>
      )}

      {historico.length > 0 && (
        <Bloco titulo="Histórico de tratamento">
          {historico.map((t) => (
            <div key={t.id} style={{ borderLeft: "3px solid #ccc", paddingLeft: 10, margin: "6px 0", breakInside: "avoid" }}>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                {ROTULO_STATUS_EV[t.para_status]} <span style={{ color: "#777", fontWeight: 400 }}>· {br(t.criado_em)}{t.ator_nome ? ` · ${t.ator_nome}` : ""}</span>
              </div>
              {t.comentario && <div style={{ fontSize: 12.5, color: "#333" }}>{t.comentario}</div>}
            </div>
          ))}
        </Bloco>
      )}

      {(rnc.reinspecao_resultado || fotosCorr.length > 0) && (
        <Bloco titulo="Reinspeção / correção">
          {rnc.reinspecao_resultado && <p style={{ margin: "0 0 6px", whiteSpace: "pre-wrap" }}>{rnc.reinspecao_resultado}</p>}
          {fotosCorr.length > 0 && <Galeria urls={fotosCorr} />}
        </Bloco>
      )}

      {/* Assinatura do inspetor (quando houver) */}
      {assinatura && (
        <div style={{ marginTop: 24, breakInside: "avoid" }}>
          <img src={assinatura} alt="Assinatura" style={{ maxWidth: 240, maxHeight: 90, objectFit: "contain" }} />
          <div style={{ borderTop: "1px solid #333", width: 260, marginTop: 2, paddingTop: 3, fontSize: 12 }}>
            {ctx.inspetor} — Inspetor responsável
          </div>
        </div>
      )}

      <div style={{ marginTop: 28, paddingTop: 8, borderTop: "1px solid #ddd", fontSize: 10.5, color: "#888", textAlign: "center" }}>
        Gerado por FieldCheck — fieldcheck.app.br · RNC {rnc.numero} · status: {rnc.status}
      </div>
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16, breakInside: "avoid" }}>
      <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 13.5, textTransform: "uppercase", color: "#1C2733", borderBottom: "2px solid #1C2733", paddingBottom: 3, marginBottom: 6 }}>
        {titulo}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}
function Grade({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 18px" }}>{children}</div>;
}
function Campo({ r, v }: { r: string; v: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12.5 }}>
      <span style={{ color: "#777" }}>{r}: </span>
      <span style={{ fontWeight: 600 }}>{v}</span>
    </div>
  );
}
function Galeria({ urls }: { urls: string[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {urls.map((u, k) => (
        <img key={k} src={u} alt={`Evidência ${k + 1}`} style={{ width: 150, height: 112, objectFit: "cover", borderRadius: 6, border: "1px solid #ddd" }} />
      ))}
    </div>
  );
}
