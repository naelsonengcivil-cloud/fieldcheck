import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Botao, Card, Header } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { db, type LocalInspecao, type LocalEvento } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { dataInspecao } from "@/lib/obraView";
import { useAuth } from "@/features/auth/AuthProvider";
import { useSync } from "@/features/sync/SyncProvider";
import { arquivarInspecao, desarquivarInspecao, excluirInspecao } from "@/lib/inspecaoAdmin";
import { editarCriticidadePrazo } from "@/lib/ncCiclo";
import { CRITICIDADES, ROTULO_CRIT, corCriticidade, prazoSugerido, vencida } from "@/lib/criticidade";
import { gerarRnc, enfileirarRnc, buscarRncsPorRespostas, corStatusRnc, ROTULO_STATUS_RNC } from "@/lib/rncService";
import { TratamentoNc } from "@/features/inspecao/TratamentoNc";
import type { Criticidade, Rnc } from "@/types/db";

// ============================================================
// Detalhe da inspeção (RF07) — somente leitura. Junta respostas +
// itens (texto) + eventos (responsável/prazo) + evidências (foto local
// ou signed URL do Storage). Lê do Dexie; funciona offline.
// ============================================================

const LABEL: Record<string, string> = { C: "CONF.", NC: "NC", NA: "N/A" };
const cor = (r: string) => (r === "C" ? T.green : r === "NC" ? T.red : T.gray);
const campoStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: `2px solid ${T.line}`,
  borderRadius: 10,
  padding: 10,
  fontSize: 15,
  resize: "vertical",
} as const;

export function Detalhe({
  insp,
  onBack,
  onAbrirRnc,
}: {
  insp: LocalInspecao;
  onBack: () => void;
  onAbrirRnc?: (rnc: Rnc) => void;
}) {
  const { perfil, empresa } = useAuth();
  const { sincronizarAgora } = useSync();
  const ehAdmin = perfil?.papel === "admin";
  const [gerandoRnc, setGerandoRnc] = useState<string | null>(null);
  const [rncMsg, setRncMsg] = useState<{ msg: string; ok: boolean } | null>(null);
  // RNCs já existentes por resposta (resposta_item_id → RNC).
  const [rncs, setRncs] = useState<Record<string, Rnc>>({});

  function avisoRnc(msg: string, ok: boolean) {
    setRncMsg({ msg, ok });
    setTimeout(() => setRncMsg(null), 3500);
  }

  async function handleGerarRnc(respostaId: string) {
    // Já existe? Abre direto, sem nova chamada (nunca duplica).
    if (rncs[respostaId]) {
      onAbrirRnc?.(rncs[respostaId]);
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      await enfileirarRnc({ resposta_item_id: respostaId });
      avisoRnc("Sem rede — a RNC será gerada ao reconectar.", true);
      return;
    }
    setGerandoRnc(respostaId);
    const { rnc, erro } = await gerarRnc({ resposta_item_id: respostaId });
    setGerandoRnc(null);
    if (erro) return avisoRnc(erro, false);
    if (rnc) {
      setRncs((prev) => ({ ...prev, [respostaId]: rnc }));
      onAbrirRnc?.(rnc);
    }
  }
  const podeReclassificar = perfil?.papel === "admin" || perfil?.papel === "gestor";
  // Edição de criticidade/prazo por NC (gestor/admin) — Marco I5.
  const [editCrit, setEditCrit] = useState<{ id: string; criticidade: Criticidade | ""; prazo: string } | null>(null);
  const [acao, setAcao] = useState<null | "arquivar" | "excluir">(null);
  const [motivo, setMotivo] = useState("");
  const [confirmoExcluir, setConfirmoExcluir] = useState("");
  const [processando, setProcessando] = useState(false);
  const [erroAdmin, setErroAdmin] = useState<string | null>(null);

  async function executarAcao(fn: () => Promise<{ error: string | null }>) {
    setProcessando(true);
    setErroAdmin(null);
    const { error } = await fn();
    setProcessando(false);
    if (error) setErroAdmin(error);
    else onBack(); // cache local já atualizado; volta à lista
  }

  async function salvarReclassificacao(evento: LocalEvento) {
    if (!editCrit || editCrit.id !== evento.id) return;
    await editarCriticidadePrazo(evento, {
      criticidade: editCrit.criticidade || null,
      prazo: editCrit.prazo || null,
    });
    setEditCrit(null);
    void sincronizarAgora();
  }

  const respostas = useLiveQuery(
    () => db.respostas.where("inspecao_id").equals(insp.id).toArray(),
    [insp.id],
    [],
  );
  const itens = useLiveQuery(
    () => db.itens.where("checklist_id").equals(insp.checklist_id).toArray(),
    [insp.checklist_id],
    [],
  );
  const eventos = useLiveQuery(() => db.eventos.toArray(), [], []);
  const checklist = useLiveQuery(
    () => db.checklists.get(insp.checklist_id),
    [insp.checklist_id],
    undefined,
  );
  const obra = useLiveQuery(() => db.obras.get(insp.obra_id), [insp.obra_id], undefined);

  const itemMap = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens]);
  const eventoMap = useMemo(
    () => new Map(eventos.map((e) => [e.resposta_id, e])),
    [eventos],
  );
  const ordenadas = useMemo(
    () =>
      [...respostas].sort(
        (a, b) => (itemMap.get(a.item_id)?.ordem ?? 0) - (itemMap.get(b.item_id)?.ordem ?? 0),
      ),
    [respostas, itemMap],
  );

  // Resolve as fotos (blob local → objectURL; url do servidor → signed URL).
  const [fotos, setFotos] = useState<Record<string, string>>({});
  useEffect(() => {
    let vivo = true;
    const criados: string[] = [];
    (async () => {
      const ids = respostas.map((r) => r.id);
      if (ids.length === 0) return;
      const evs = await db.evidencias
        .where("resposta_id")
        .anyOf(ids)
        .toArray();
      const map: Record<string, string> = {};
      for (const ev of evs) {
        if (!ev.resposta_id) continue;
        if (ev.blob) {
          const u = URL.createObjectURL(ev.blob);
          criados.push(u);
          map[ev.resposta_id] = u;
        } else if (ev.url) {
          const { data } = await supabase.storage
            .from("evidencias")
            .createSignedUrl(ev.url, 3600);
          if (data?.signedUrl) map[ev.resposta_id] = data.signedUrl;
        }
      }
      if (vivo) setFotos(map);
    })();
    return () => {
      vivo = false;
      criados.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [respostas]);

  // Carrega RNCs já existentes para as respostas NC (online → mostra "Abrir RNC").
  useEffect(() => {
    if (!onAbrirRnc) return;
    const ids = respostas.filter((r) => r.resposta === "NC").map((r) => r.id);
    if (!ids.length) return;
    void buscarRncsPorRespostas(ids).then((m) => setRncs(Object.fromEntries(m)));
  }, [respostas, onAbrirRnc]);

  return (
    <div>
      <Header
        titulo={checklist?.codigo ?? "Inspeção"}
        sub={[
          checklist?.nome,
          obra?.nome,
          insp.frente || null,
          insp.projeto_ref_numero
            ? `Proj. ${insp.projeto_ref_numero}${insp.projeto_ref_revisao ? ` rev ${insp.projeto_ref_revisao}` : ""}`
            : null,
          dataInspecao(insp).split("-").reverse().join("/"),
        ]
          .filter(Boolean)
          .join(" · ")}
        onBack={onBack}
      />
      {rncMsg && (
        <div role="status" style={{ padding: "10px 14px", background: rncMsg.ok ? T.greenBg : T.redBg, color: rncMsg.ok ? T.green : T.red, fontWeight: 600, fontSize: 13.5 }}>
          {rncMsg.msg}
        </div>
      )}
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {ordenadas.map((r) => {
          const item = itemMap.get(r.item_id);
          const evento = eventoMap.get(r.id);
          const foto = fotos[r.id];
          return (
            <div
              key={r.id}
              style={{
                background: T.card,
                borderRadius: 12,
                border: `1px solid ${T.line}`,
                borderLeft: `5px solid ${cor(r.resposta)}`,
                padding: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontSize: 14.5, fontWeight: 600 }}>
                  {item?.texto ?? "(item)"}
                </span>
                <span
                  style={{
                    fontFamily: FONT_HEAD,
                    fontWeight: 700,
                    color: cor(r.resposta),
                    flexShrink: 0,
                  }}
                >
                  {LABEL[r.resposta] ?? r.resposta}
                </span>
              </div>
              {r.resposta === "NC" && (
                <>
                  {evento && (
                    <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {evento.criticidade ? (
                        <span
                          style={{
                            fontFamily: FONT_HEAD,
                            fontWeight: 700,
                            fontSize: 12,
                            textTransform: "uppercase",
                            letterSpacing: 0.4,
                            color: corCriticidade(evento.criticidade).fg,
                            background: corCriticidade(evento.criticidade).bg,
                            padding: "3px 9px",
                            borderRadius: 999,
                          }}
                        >
                          {ROTULO_CRIT[evento.criticidade]}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: T.inkSoft, fontStyle: "italic" }}>sem criticidade</span>
                      )}
                      {vencida(evento.prazo, evento.status) && (
                        <span
                          style={{
                            fontFamily: FONT_HEAD,
                            fontWeight: 700,
                            fontSize: 12,
                            textTransform: "uppercase",
                            letterSpacing: 0.4,
                            color: "#fff",
                            background: T.red,
                            padding: "3px 9px",
                            borderRadius: 999,
                          }}
                        >
                          ⏰ Vencida
                        </span>
                      )}
                      {podeReclassificar && editCrit?.id !== evento.id && (
                        <button
                          onClick={() =>
                            setEditCrit({ id: evento.id, criticidade: evento.criticidade ?? "", prazo: evento.prazo ?? "" })
                          }
                          style={{ background: "none", border: `1px solid ${T.navy}`, color: T.navy, fontWeight: 700, fontSize: 12, cursor: "pointer", borderRadius: 8, padding: "3px 9px" }}
                        >
                          Reclassificar
                        </button>
                      )}
                    </div>
                  )}
                  {evento && editCrit?.id === evento.id && (
                    <div style={{ marginTop: 8, background: T.card, border: `1px dashed ${T.line}`, borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
                        {CRITICIDADES.map((c) => {
                          const sel = editCrit.criticidade === c;
                          const cc = corCriticidade(c);
                          return (
                            <button
                              key={c}
                              onClick={() =>
                                setEditCrit((prev) => {
                                  if (!prev) return prev;
                                  // Sem prazo definido → sugere ao escolher a criticidade.
                                  const prazo = prev.prazo || prazoSugerido(c, empresa?.prazos_nc);
                                  return { ...prev, criticidade: c, prazo };
                                })
                              }
                              style={{
                                padding: "8px 2px",
                                borderRadius: 8,
                                cursor: "pointer",
                                fontSize: 12,
                                fontWeight: 700,
                                border: sel ? `2px solid ${cc.fg}` : `2px solid ${T.line}`,
                                background: sel ? cc.bg : "#fff",
                                color: sel ? cc.fg : T.inkSoft,
                              }}
                            >
                              {ROTULO_CRIT[c]}
                            </button>
                          );
                        })}
                      </div>
                      <input
                        type="date"
                        value={editCrit.prazo}
                        onChange={(e) => setEditCrit((prev) => (prev ? { ...prev, prazo: e.target.value } : prev))}
                        style={{ border: `2px solid ${T.line}`, borderRadius: 10, padding: 10, fontSize: 14 }}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <Botao
                          disabled={!editCrit.criticidade || !editCrit.prazo}
                          onClick={() => void salvarReclassificacao(evento)}
                          style={{ fontSize: 14 }}
                        >
                          Salvar
                        </Botao>
                        <Botao variante="fantasma" onClick={() => setEditCrit(null)} style={{ fontSize: 14 }}>
                          Cancelar
                        </Botao>
                      </div>
                    </div>
                  )}
                  <div style={{ marginTop: 8, display: "flex", gap: 10 }}>
                    {foto && (
                      <img
                        src={foto}
                        alt="Evidência"
                        style={{
                          width: 70,
                          height: 70,
                          objectFit: "cover",
                          borderRadius: 8,
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <div style={{ fontSize: 13, color: T.inkSoft }}>
                      {r.observacao}
                      {r.classificacao_st && (
                        <>
                          <br />
                          🔺{" "}
                          {r.classificacao_st === "ato_inseguro"
                            ? "Ato inseguro"
                            : r.classificacao_st === "condicao_insegura"
                              ? "Condição insegura"
                              : "Quase acidente"}
                        </>
                      )}
                      <br />
                      {`📌 origem ${dataInspecao(insp).split("-").reverse().join("/")}`}
                      {evento?.responsavel && ` · 👤 ${evento.responsavel}`}
                      {evento?.prazo &&
                        ` · 📅 ${evento.prazo.split("-").reverse().join("/")}`}
                    </div>
                  </div>
                  {onAbrirRnc && (
                    <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      {rncs[r.id] && (
                        <span
                          style={{
                            fontFamily: FONT_HEAD,
                            fontWeight: 700,
                            fontSize: 11.5,
                            textTransform: "uppercase",
                            letterSpacing: 0.4,
                            color: corStatusRnc(rncs[r.id].status).fg,
                            background: corStatusRnc(rncs[r.id].status).bg,
                            padding: "3px 9px",
                            borderRadius: 999,
                          }}
                        >
                          RNC {rncs[r.id].numero} · {ROTULO_STATUS_RNC[rncs[r.id].status]}
                        </span>
                      )}
                      <button
                        onClick={() => void handleGerarRnc(r.id)}
                        disabled={gerandoRnc === r.id}
                        style={{
                          background: rncs[r.id] ? T.navy : "none",
                          border: `1px solid ${T.navy}`,
                          color: rncs[r.id] ? "#fff" : T.navy,
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: "pointer",
                          borderRadius: 9,
                          padding: "8px 12px",
                        }}
                      >
                        {gerandoRnc === r.id ? "Gerando RNC…" : rncs[r.id] ? "📄 Abrir RNC" : "📄 Gerar RNC"}
                      </button>
                    </div>
                  )}
                  {evento && perfil && (
                    <TratamentoNc
                      evento={evento}
                      papel={perfil.papel}
                      ator={{ id: perfil.id, nome: perfil.nome }}
                    />
                  )}
                </>
              )}
              {r.resposta === "C" && foto && (
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <img
                    src={foto}
                    alt="Evidência de conformidade"
                    style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 12.5, color: T.green, fontWeight: 600 }}>
                    Evidência de conformidade
                  </span>
                </div>
              )}
            </div>
          );
        })}
        {ordenadas.length === 0 && (
          <div style={{ textAlign: "center", color: T.inkSoft, padding: 20 }}>
            Sem respostas para exibir.
          </div>
        )}

        {ehAdmin && (
          <Card style={{ borderColor: T.red, marginTop: 6 }}>
            <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", color: T.red }}>
              Administração
            </div>

            {erroAdmin && (
              <div style={{ background: T.redBg, color: T.red, borderRadius: 8, padding: "8px 10px", fontSize: 13.5, fontWeight: 600, marginTop: 10 }}>
                {erroAdmin}
              </div>
            )}

            {acao === null && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                {insp.arquivada ? (
                  <>
                    <div style={{ fontSize: 13.5, color: T.inkSoft }}>
                      Inspeção arquivada — fora dos KPIs e listas padrão.
                    </div>
                    <Botao variante="fantasma" disabled={processando} onClick={() => void executarAcao(() => desarquivarInspecao(insp.id))}>
                      Desarquivar
                    </Botao>
                  </>
                ) : (
                  <Botao variante="fantasma" onClick={() => setAcao("arquivar")}>Arquivar inspeção</Botao>
                )}
                <Botao
                  variante="fantasma"
                  style={{ color: T.red, borderColor: T.red }}
                  onClick={() => setAcao("excluir")}
                >
                  Excluir definitivamente
                </Botao>
                <div style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.5 }}>
                  Arquivar remove dos KPIs (reversível). Excluir apaga tudo
                  permanentemente e registra no log de auditoria.
                </div>
              </div>
            )}

            {acao === "arquivar" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Motivo do arquivamento (obrigatório)"
                  rows={2}
                  style={campoStyle}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <Botao
                    disabled={processando || !motivo.trim()}
                    onClick={() => void executarAcao(() => arquivarInspecao(insp.id, motivo.trim()))}
                  >
                    Confirmar arquivamento
                  </Botao>
                  <Botao variante="fantasma" onClick={() => { setAcao(null); setMotivo(""); }}>Cancelar</Botao>
                </div>
              </div>
            )}

            {acao === "excluir" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                <div style={{ fontSize: 13.5, color: T.red, fontWeight: 600, lineHeight: 1.5 }}>
                  Ação irreversível: remove a inspeção, respostas, NCs e evidências.
                  Fica registrado no log de auditoria (quem/quando/motivo).
                </div>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Motivo da exclusão (obrigatório)"
                  rows={2}
                  style={campoStyle}
                />
                <input
                  value={confirmoExcluir}
                  onChange={(e) => setConfirmoExcluir(e.target.value)}
                  placeholder="Digite EXCLUIR para confirmar"
                  style={campoStyle}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <Botao
                    variante="escuro"
                    style={{ background: T.red }}
                    disabled={processando || confirmoExcluir.trim() !== "EXCLUIR" || !motivo.trim()}
                    onClick={() => void executarAcao(() => excluirInspecao(insp.id, motivo.trim()))}
                  >
                    {processando ? "Excluindo…" : "Excluir definitivamente"}
                  </Botao>
                  <Botao variante="fantasma" onClick={() => { setAcao(null); setMotivo(""); setConfirmoExcluir(""); }}>Cancelar</Botao>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
