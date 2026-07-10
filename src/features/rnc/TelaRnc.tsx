import { useEffect, useMemo, useState } from "react";
import { Botao, Card, Header } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { supabase } from "@/lib/supabase";
import {
  GRAVIDADES,
  ROTULO_GRAVIDADE,
  ROTULO_STATUS_RNC,
  RODAPE_RESPONSABILIDADE,
  TRANSICOES_RNC,
  atualizarRnc,
  carregarSecoesRnc,
  corGravidade,
} from "@/lib/rncService";
import type { Rnc, RncGravidade, RncSecao, RncStatus, RncSecoesTexto } from "@/types/db";

// ============================================================
// Editor da RNC (Marco RNC) — 12 seções na ordem de rnc_secoes. Seções
// normativas (6,7,9,10) vêm da IA (selo "revise antes de formalizar");
// seção 8 = gravidade (badge da sugestão do agente); disposição/fechamento
// com workflow de status. Rodapé de responsabilidade técnica obrigatório.
// ============================================================

interface Contexto {
  obra: string;
  cliente: string;
  contratada: string;
  data: string;
  inspetor: string;
  checklistNome: string;
  itemTexto: string;
  criterio: string;
}

export function TelaRnc({ rnc: rncInicial, onVoltar }: { rnc: Rnc; onVoltar: () => void }) {
  const [rnc, setRnc] = useState<Rnc>(rncInicial);
  const [secoes, setSecoes] = useState<RncSecao[]>([]);
  const [ctx, setCtx] = useState<Contexto | null>(null);
  const [fotos, setFotos] = useState<string[]>([]);
  const [verOriginal, setVerOriginal] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ msg: string; ok: boolean } | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [motivoCancel, setMotivoCancel] = useState("");

  // Estado editável.
  const [texto, setTexto] = useState<RncSecoesTexto>(rncInicial.secoes_final);
  const [local, setLocal] = useState(rncInicial.local ?? "");
  const [ativo, setAtivo] = useState(rncInicial.ativo ?? "");
  const [descricao, setDescricao] = useState(rncInicial.descricao_nc ?? "");
  const [gravidade, setGravidade] = useState<RncGravidade>(rncInicial.gravidade);
  const [riscoComp, setRiscoComp] = useState(rncInicial.risco_complementar ?? "");
  const [acaoComp, setAcaoComp] = useState(rncInicial.acao_complementar ?? "");
  const [prazoDias, setPrazoDias] = useState(rncInicial.prazo_dias != null ? String(rncInicial.prazo_dias) : "");
  const [responsavel, setResponsavel] = useState(rncInicial.responsavel ?? "");
  const [reinspecao, setReinspecao] = useState(rncInicial.reinspecao_resultado ?? "");

  const editavel = rnc.status !== "fechada" && rnc.status !== "cancelada";
  const secaoPorOrdem = useMemo(() => new Map(secoes.map((s) => [s.ordem, s])), [secoes]);

  function mostrar(msg: string, ok: boolean) {
    setAviso({ msg, ok });
    setTimeout(() => setAviso(null), 3500);
  }

  useEffect(() => {
    void (async () => {
      setSecoes(await carregarSecoesRnc());
      // Contexto de identificação (seções 1–2) — a partir da inspeção de origem.
      const { data: insp } = await supabase
        .from("inspecoes")
        .select("obra_id, checklist_id, inspetor_id, contratada, finalizada_em")
        .eq("id", rnc.inspecao_id)
        .maybeSingle();
      if (insp) {
        const [{ data: obra }, { data: ck }, { data: ins }] = await Promise.all([
          supabase.from("obras").select("nome, cliente").eq("id", insp.obra_id).maybeSingle(),
          supabase.from("checklists").select("nome").eq("id", insp.checklist_id).maybeSingle(),
          supabase.from("usuarios").select("nome").eq("id", insp.inspetor_id).maybeSingle(),
        ]);
        const { data: itens } = await supabase
          .from("itens_checklist")
          .select("texto, criterio, ordem")
          .eq("checklist_id", insp.checklist_id);
        const it = (itens ?? []).find((i) => i.ordem === rnc.item_numero);
        setCtx({
          obra: obra?.nome ?? "",
          cliente: obra?.cliente ?? "",
          contratada: insp.contratada ?? "",
          data: insp.finalizada_em ? insp.finalizada_em.slice(0, 10).split("-").reverse().join("/") : "",
          inspetor: ins?.nome ?? "",
          checklistNome: ck?.nome ?? "",
          itemTexto: it?.texto ?? "",
          criterio: it?.criterio ?? "",
        });
      }
    })();
  }, [rnc.inspecao_id, rnc.item_numero]);

  // Fotos de abertura (paths → signed URLs).
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const urls: string[] = [];
      for (const path of rnc.fotos ?? []) {
        const { data } = await supabase.storage.from("evidencias").createSignedUrl(path, 3600);
        if (data?.signedUrl) urls.push(data.signedUrl);
      }
      if (vivo) setFotos(urls);
    })();
    return () => { vivo = false; };
  }, [rnc.fotos]);

  async function salvar() {
    setSalvando(true);
    const patch: Partial<Rnc> = {
      secoes_final: texto,
      local: local.trim() || null,
      ativo: ativo.trim() || null,
      descricao_nc: descricao.trim(),
      gravidade,
      risco_complementar: riscoComp.trim() || null,
      acao_complementar: acaoComp.trim() || null,
      prazo_dias: prazoDias ? parseInt(prazoDias, 10) : null,
      responsavel: responsavel.trim() || null,
      reinspecao_resultado: reinspecao.trim() || null,
    };
    const { erro } = await atualizarRnc(rnc.id, patch);
    setSalvando(false);
    if (erro) return mostrar(erro, false);
    setRnc({ ...rnc, ...patch } as Rnc);
    mostrar("RNC salva ✓", true);
  }

  async function mudarStatus(novo: RncStatus) {
    if (novo === "cancelada" && !motivoCancel.trim()) {
      setCancelando(true);
      return;
    }
    const patch: Partial<Rnc> = { status: novo };
    if (novo === "fechada") patch.data_fechamento = new Date().toISOString();
    if (novo === "cancelada") patch.reinspecao_resultado = `Cancelada: ${motivoCancel.trim()}`;
    const { erro } = await atualizarRnc(rnc.id, patch);
    if (erro) return mostrar(erro, false);
    setRnc({ ...rnc, ...patch } as Rnc);
    setCancelando(false);
    setMotivoCancel("");
    mostrar(`Status: ${ROTULO_STATUS_RNC[novo]}`, true);
  }

  const proximos = TRANSICOES_RNC[rnc.status] ?? [];
  const temIA = rnc.secoes_agente !== null;
  const cor = corGravidade(gravidade);

  return (
    <div>
      <Header
        titulo={rnc.numero}
        sub={`RNC · ${rnc.checklist_codigo} item ${rnc.item_numero}`}
        onBack={onVoltar}
        right={
          <span style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 12.5, textTransform: "uppercase", color: "#fff", opacity: 0.9 }}>
            {ROTULO_STATUS_RNC[rnc.status]}
          </span>
        }
      />
      {aviso && (
        <div role="status" style={{ padding: "10px 14px", background: aviso.ok ? T.greenBg : T.redBg, color: aviso.ok ? T.green : T.red, fontWeight: 600, fontSize: 13.5 }}>
          {aviso.msg}
        </div>
      )}
      {temIA && (
        <div style={{ padding: "8px 14px", background: "#FFF4D6", color: T.yellowDark, fontSize: 12.5, fontWeight: 600 }}>
          ✨ Seções normativas preenchidas por IA — revise antes de formalizar.
        </div>
      )}

      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, paddingBottom: 40 }}>
        {/* 1. Identificação */}
        <Bloco s={secaoPorOrdem.get(1)}>
          <Linha k="Nº da RNC" v={rnc.numero} />
          <Linha k="Obra" v={ctx?.obra} />
          <Linha k="Cliente" v={ctx?.cliente} />
          <Linha k="Contratada" v={ctx?.contratada} />
          <Linha k="Data da inspeção" v={ctx?.data} />
          <Linha k="Inspetor" v={ctx?.inspetor} />
        </Bloco>

        {/* 2. Origem */}
        <Bloco s={secaoPorOrdem.get(2)}>
          <Linha k="Checklist" v={`${rnc.checklist_codigo} · ${ctx?.checklistNome ?? ""}`} />
          <Linha k="Item" v={`${rnc.item_numero} — ${ctx?.itemTexto ?? ""}`} />
          <Linha k="Critério" v={ctx?.criterio} />
        </Bloco>

        {/* 3. Local e ativo */}
        <Bloco s={secaoPorOrdem.get(3)}>
          <Campo label="Local inspecionado" value={local} onChange={setLocal} disabled={!editavel} />
          <Campo label="Ativo" value={ativo} onChange={setAtivo} disabled={!editavel} />
        </Bloco>

        {/* 4. Descrição */}
        <Bloco s={secaoPorOrdem.get(4)}>
          <Area value={descricao} onChange={setDescricao} disabled={!editavel} rows={3} />
        </Bloco>

        {/* 5. Evidência fotográfica */}
        <Bloco s={secaoPorOrdem.get(5)}>
          {fotos.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {fotos.map((u, i) => (
                <img key={i} src={u} alt="Evidência" style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 8, border: `1px solid ${T.line}` }} />
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: T.inkSoft }}>Sem foto de abertura registrada.</div>
          )}
        </Bloco>

        {/* 6,7,9,10 — seções normativas (IA) */}
        <SecaoIA s={secaoPorOrdem.get(6)} campo="requisito" texto={texto} setTexto={setTexto} agente={rnc.secoes_agente} disabled={!editavel} verOriginal={verOriginal} />
        <SecaoIA s={secaoPorOrdem.get(7)} campo="fundamentacao" texto={texto} setTexto={setTexto} agente={rnc.secoes_agente} disabled={!editavel} verOriginal={verOriginal} />

        {/* 8. Gravidade */}
        <Bloco s={secaoPorOrdem.get(8)}>
          {rnc.gravidade_sugerida_agente && (
            <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 8 }}>
              Sugestão do agente:{" "}
              <b style={{ color: corGravidade(rnc.gravidade_sugerida_agente).fg }}>
                {ROTULO_GRAVIDADE[rnc.gravidade_sugerida_agente]}
              </b>{" "}
              — decisão do inspetor abaixo.
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
            {GRAVIDADES.map((g) => {
              const sel = gravidade === g;
              const c = corGravidade(g);
              return (
                <button
                  key={g}
                  disabled={!editavel}
                  onClick={() => setGravidade(g)}
                  style={{
                    padding: "9px 2px",
                    borderRadius: 9,
                    cursor: editavel ? "pointer" : "default",
                    fontSize: 12,
                    fontWeight: 700,
                    border: sel ? `2px solid ${c.fg}` : `2px solid ${T.line}`,
                    background: sel ? c.bg : "#fff",
                    color: sel ? c.fg : T.inkSoft,
                  }}
                >
                  {ROTULO_GRAVIDADE[g]}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: T.inkSoft }}>
            Selo atual:{" "}
            <span style={{ fontWeight: 700, color: cor.fg, background: cor.bg, padding: "2px 8px", borderRadius: 999 }}>
              {ROTULO_GRAVIDADE[gravidade]}
            </span>
          </div>
        </Bloco>

        <SecaoIA s={secaoPorOrdem.get(9)} campo="risco" texto={texto} setTexto={setTexto} agente={rnc.secoes_agente} disabled={!editavel} verOriginal={verOriginal}>
          <Campo label="Risco complementar (inspetor)" value={riscoComp} onChange={setRiscoComp} disabled={!editavel} sugestao={rnc.risco_complementar} />
        </SecaoIA>
        <SecaoIA s={secaoPorOrdem.get(10)} campo="acao" texto={texto} setTexto={setTexto} agente={rnc.secoes_agente} disabled={!editavel} verOriginal={verOriginal}>
          <Campo label="Ação complementar (inspetor)" value={acaoComp} onChange={setAcaoComp} disabled={!editavel} sugestao={rnc.acao_complementar} />
        </SecaoIA>

        {/* 11. Disposição e acompanhamento */}
        <Bloco s={secaoPorOrdem.get(11)}>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <Campo label="Prazo (dias)" value={prazoDias} onChange={(v) => setPrazoDias(v.replace(/\D/g, ""))} disabled={!editavel} />
            </div>
            <div style={{ flex: 2 }}>
              <Campo label="Responsável" value={responsavel} onChange={setResponsavel} disabled={!editavel} />
            </div>
          </div>
        </Bloco>

        {/* 12. Fechamento */}
        <Bloco s={secaoPorOrdem.get(12)}>
          <Area value={reinspecao} onChange={setReinspecao} disabled={!editavel} rows={2} placeholder="Resultado da reinspeção / observações de fechamento…" />
          {rnc.data_fechamento && (
            <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 6 }}>
              Fechada em {new Date(rnc.data_fechamento).toLocaleString("pt-BR")}
            </div>
          )}
        </Bloco>

        {/* Ações */}
        {editavel && (
          <>
            <Botao onClick={() => void salvar()} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar RNC"}
            </Botao>
            <button
              onClick={() => setVerOriginal((v) => !v)}
              disabled={!temIA}
              style={{ background: "none", border: "none", color: temIA ? T.navy : T.inkSoft, fontWeight: 700, fontSize: 13, cursor: temIA ? "pointer" : "default", fontFamily: FONT_HEAD }}
            >
              {verOriginal ? "Ocultar texto original do agente" : "Ver texto original do agente"}
            </button>

            {proximos.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                {proximos.map((st) => (
                  <Botao
                    key={st}
                    variante="fantasma"
                    style={st === "cancelada" ? { color: T.red, borderColor: T.red } : {}}
                    onClick={() => void mudarStatus(st)}
                  >
                    {st === "cancelada" ? "Cancelar RNC" : `→ ${ROTULO_STATUS_RNC[st]}`}
                  </Botao>
                ))}
              </div>
            )}
          </>
        )}

        {cancelando && (
          <Card style={{ borderColor: T.red }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>Justificativa do cancelamento (obrigatória):</div>
            <Area value={motivoCancel} onChange={setMotivoCancel} rows={2} />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <Botao style={{ background: T.red }} variante="escuro" disabled={!motivoCancel.trim()} onClick={() => void mudarStatus("cancelada")}>
                Confirmar cancelamento
              </Botao>
              <Botao variante="fantasma" onClick={() => { setCancelando(false); setMotivoCancel(""); }}>Voltar</Botao>
            </div>
          </Card>
        )}

        <div style={{ fontSize: 11, color: T.inkSoft, fontStyle: "italic", lineHeight: 1.5, borderTop: `1px solid ${T.line}`, paddingTop: 10, marginTop: 6 }}>
          {RODAPE_RESPONSABILIDADE}
        </div>
      </div>
    </div>
  );
}

// ---------- subcomponentes ----------
function Bloco({ s, children }: { s?: RncSecao; children: React.ReactNode }) {
  return (
    <Card>
      <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 14.5, textTransform: "uppercase", color: T.inkSoft, marginBottom: 8 }}>
        {s ? `${s.ordem}. ${s.secao}` : ""}
      </div>
      {children}
    </Card>
  );
}

function SecaoIA({
  s, campo, texto, setTexto, agente, disabled, verOriginal, children,
}: {
  s?: RncSecao;
  campo: keyof RncSecoesTexto;
  texto: RncSecoesTexto;
  setTexto: React.Dispatch<React.SetStateAction<RncSecoesTexto>>;
  agente: RncSecoesTexto | null;
  disabled: boolean;
  verOriginal: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 14.5, textTransform: "uppercase", color: T.inkSoft }}>
          {s ? `${s.ordem}. ${s.secao}` : ""}
        </div>
        {agente && (
          <span style={{ fontSize: 10.5, fontWeight: 700, color: T.yellowDark, background: "#FFF4D6", padding: "2px 7px", borderRadius: 999 }}>
            IA · revise
          </span>
        )}
      </div>
      <textarea
        value={texto[campo]}
        disabled={disabled}
        onChange={(e) => setTexto((prev) => ({ ...prev, [campo]: e.target.value }))}
        rows={5}
        style={{ width: "100%", boxSizing: "border-box", border: `2px solid ${T.line}`, borderRadius: 10, padding: 10, fontSize: 14, resize: "vertical", lineHeight: 1.45 }}
      />
      {verOriginal && agente && agente[campo] !== texto[campo] && (
        <div style={{ marginTop: 8, background: "#F6F6F2", border: `1px dashed ${T.line}`, borderRadius: 8, padding: 8, fontSize: 12.5, color: T.inkSoft, lineHeight: 1.45 }}>
          <b>Original do agente:</b>
          <div style={{ marginTop: 3, whiteSpace: "pre-wrap" }}>{agente[campo]}</div>
        </div>
      )}
      {children && <div style={{ marginTop: 10 }}>{children}</div>}
    </Card>
  );
}

function Linha({ k, v }: { k: string; v?: string | null }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 13.5, padding: "3px 0" }}>
      <span style={{ color: T.inkSoft, minWidth: 130 }}>{k}:</span>
      <span style={{ fontWeight: 600 }}>{v || "—"}</span>
    </div>
  );
}

function Campo({ label, value, onChange, disabled, sugestao }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean; sugestao?: string | null }) {
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 3 }}>{label}</div>
      <input
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", boxSizing: "border-box", border: `2px solid ${T.line}`, borderRadius: 10, padding: 9, fontSize: 14 }}
      />
      {sugestao && !value && (
        <button
          onClick={() => onChange(sugestao)}
          style={{ background: "none", border: "none", color: T.navy, fontSize: 12, cursor: "pointer", padding: "4px 0 0", fontWeight: 600 }}
        >
          Usar sugestão da IA: “{sugestao.slice(0, 60)}{sugestao.length > 60 ? "…" : ""}”
        </button>
      )}
    </div>
  );
}

function Area({ value, onChange, disabled, rows = 3, placeholder }: { value: string; onChange: (v: string) => void; disabled?: boolean; rows?: number; placeholder?: string }) {
  return (
    <textarea
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      style={{ width: "100%", boxSizing: "border-box", border: `2px solid ${T.line}`, borderRadius: 10, padding: 10, fontSize: 14, resize: "vertical", lineHeight: 1.45 }}
    />
  );
}
