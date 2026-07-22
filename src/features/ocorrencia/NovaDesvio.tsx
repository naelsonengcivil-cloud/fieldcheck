import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Botao, Card, Header, inputStyle } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { db, type LocalOcorrencia } from "@/lib/db";
import { CapturaFoto } from "@/features/inspecao/CapturaFoto";
import { MAX_FOTOS, type FotoLocal } from "@/lib/inspecaoService";
import { ROTULO_OCORRENCIA, TIPOS_DESVIO, ehDesvio, type DadosOcorrencia } from "@/lib/ocorrenciaService";
import { CRITICIDADES, ROTULO_CRIT, corCriticidade } from "@/lib/criticidade";
import { aceitaNovaInspecao } from "@/lib/obraStatus";
import { analisarFotos, MAX_FOTOS_TRIAGEM } from "@/lib/triagemService";
import { useAuth } from "@/features/auth/AuthProvider";
import type { Criticidade, TipoDesvio, TriagemIa } from "@/types/db";

// ============================================================
// Registrar desvio (Marco M · M-1) — coleta rápida da BASE da Pirâmide de
// Bird: ato inseguro / condição insegura / quase acidente. Formulário
// mínimo, 100% offline (mesma fila das ocorrências). Data/hora editável
// (padrão retroativo do sistema, nunca futura). Contratada, frente e item
// de cronograma (EAP) são eixos opcionais para BI/alertas.
// ============================================================

export function NovaDesvio({
  obraInicial,
  desvioExistente,
  onBack,
  onSalvar,
  salvando,
}: {
  /** Pré-seleciona a obra quando o registro nasce de dentro dela. */
  obraInicial?: string | null;
  /** Quando presente, o formulário edita este desvio (Frente 2). */
  desvioExistente?: LocalOcorrencia | null;
  onBack: () => void;
  onSalvar: (dados: DadosOcorrencia) => void;
  salvando: boolean;
}) {
  const editando = !!desvioExistente;
  const obrasCache = useLiveQuery(() => db.obras.toArray(), [], []);
  const obras = useMemo(() => obrasCache.filter((o) => aceitaNovaInspecao(o.status)), [obrasCache]);
  const contratadasCache = useLiveQuery(() => db.contratadas.toArray(), [], []);
  const contratadas = contratadasCache.filter((c) => c.ativa);

  const { empresa } = useAuth();
  const [obraId, setObraId] = useState(desvioExistente?.obra_id ?? obraInicial ?? "");
  const [tipo, setTipo] = useState<TipoDesvio | null>(
    desvioExistente && ehDesvio(desvioExistente.tipo) ? desvioExistente.tipo : null,
  );
  const [criticidade, setCriticidade] = useState<Criticidade | null>(desvioExistente?.criticidade ?? null);
  const [quando, setQuando] = useState(
    desvioExistente?.ocorrida_em ? paraInputLocal(desvioExistente.ocorrida_em) : agoraInputLocal(),
  );
  const [descricao, setDescricao] = useState(desvioExistente?.descricao ?? "");
  const [contratadaId, setContratadaId] = useState(desvioExistente?.contratada_id ?? "");
  const [frente, setFrente] = useState(desvioExistente?.frente ?? "");
  const [refCronograma, setRefCronograma] = useState(desvioExistente?.ref_cronograma_codigo ?? "");
  const [fotos, setFotos] = useState<FotoLocal[]>([]);
  // M-2 — triagem por IA (opcional; sugestão sempre editável).
  const [analisando, setAnalisando] = useState(false);
  const [triagem, setTriagem] = useState<TriagemIa | null>(desvioExistente?.triagem_ia ?? null);
  const [editadoAposIa, setEditadoAposIa] = useState(desvioExistente?.editado_apos_ia ?? false);
  const [agendarAnalise, setAgendarAnalise] = useState(false);
  const [avisoIa, setAvisoIa] = useState<string | null>(null);

  const iaDisponivel = empresa?.ia_habilitada !== false;
  const retroativo = quando.slice(0, 10) < agoraInputLocal().slice(0, 10);
  const pronto = !!obraId && !!tipo && !!criticidade && descricao.trim().length > 0 && !salvando;

  // Qualquer ajuste após aplicar a IA marca a trilha `editado_apos_ia`.
  const marcarEdicao = () => {
    if (triagem) setEditadoAposIa(true);
  };

  // Frente 1: descarta a sugestão da IA e devolve os campos ao preenchimento
  // manual. A decisão passa a ser humana → origem_ia=false (via triagem=null no
  // salvar). O fato de a IA ter rodado continua auditado em ia_uso. Foto e
  // demais dados digitados são preservados.
  function limparSugestao() {
    setTriagem(null);
    setEditadoAposIa(false);
    setAgendarAnalise(false);
    setTipo(null);
    setCriticidade(null);
    setDescricao("");
    setAvisoIa(null);
  }

  async function analisarComIA() {
    setAvisoIa(null);
    if (!fotos.length) return;
    if (!navigator.onLine) {
      // Offline: agenda para a sincronização (fila triagem_pendentes).
      setAgendarAnalise(true);
      setAvisoIa("Sem rede agora — a análise por IA foi agendada para quando o desvio sincronizar.");
      return;
    }
    setAnalisando(true);
    const t = await analisarFotos(
      fotos.map((f) => f.blob),
      {
        obra: obrasCache.find((o) => o.id === obraId)?.nome ?? null,
        frente: frente || null,
        contratada: contratadas.find((c) => c.id === contratadaId)?.nome ?? null,
        descricao: descricao || null,
      },
    );
    setAnalisando(false);
    if (!t) {
      setAvisoIa("A análise por IA não está disponível agora — o registro manual segue normal.");
      return;
    }
    // Sugestões preenchem o formulário (editáveis, com selo "IA · revise").
    setTriagem(t);
    setEditadoAposIa(false);
    setTipo(t.classificacao);
    setCriticidade(t.criticidade);
    if (!descricao.trim()) setDescricao(t.descricao_visivel);
  }

  function salvar() {
    if (!tipo || !criticidade) return;
    const ocorridaEm = new Date(quando).toISOString();
    onSalvar({
      obra_id: obraId,
      contratada_id: contratadaId || null,
      tipo,
      data: ocorridaEm.slice(0, 10),
      descricao,
      fotos: fotos.map((f) => f.blob),
      criticidade,
      frente: frente || null,
      ref_cronograma_codigo: refCronograma || null,
      ocorrida_em: ocorridaEm,
      triagem_ia: triagem,
      origem_ia: triagem !== null,
      editado_apos_ia: editadoAposIa,
      analisar_apos_sync: agendarAnalise && !triagem,
    });
  }

  return (
    <div>
      <Header titulo={editando ? "Editar desvio" : "Registrar desvio"} sub="Base da Pirâmide de Bird — registro rápido" onBack={onBack} />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={campo}>
          <span style={rotulo}>Obra</span>
          <select value={obraId} onChange={(e) => setObraId(e.target.value)} style={inputStyle}>
            <option value="">Selecione a obra…</option>
            {obras.map((o) => (
              <option key={o.id} value={o.id}>{o.nome}</option>
            ))}
          </select>
        </label>

        <div style={campo}>
          <span style={rotulo}>Classificação</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
            {TIPOS_DESVIO.map((t) => (
              <button
                key={t}
                onClick={() => { setTipo(t); marcarEdicao(); }}
                style={{
                  minHeight: 44, borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 14.5,
                  border: `2px solid ${tipo === t ? T.yellow : T.line}`,
                  background: tipo === t ? "#FFF8E6" : T.card,
                  color: tipo === t ? T.yellowDark : T.ink,
                }}
              >
                {ROTULO_OCORRENCIA[t]}
              </button>
            ))}
          </div>
        </div>

        <div style={campo}>
          <span style={rotulo}>Criticidade</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            {CRITICIDADES.map((c) => {
              const cor = corCriticidade(c);
              const ativa = criticidade === c;
              return (
                <button
                  key={c}
                  onClick={() => { setCriticidade(c); marcarEdicao(); }}
                  style={{
                    minHeight: 40, borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 12.5,
                    border: `2px solid ${ativa ? cor.fg : T.line}`,
                    background: ativa ? cor.bg : T.card,
                    color: ativa ? cor.fg : T.inkSoft,
                  }}
                >
                  {ROTULO_CRIT[c]}
                </button>
              );
            })}
          </div>
        </div>

        <label style={campo}>
          <span style={rotulo}>Data e hora do desvio</span>
          <input
            type="datetime-local"
            value={quando}
            max={agoraInputLocal()}
            onChange={(e) => setQuando(e.target.value)}
            style={inputStyle}
          />
          {retroativo && (
            <span style={{ fontSize: 12.5, color: T.yellowDark, fontWeight: 600 }}>
              ⚠️ Registro retroativo — a data do registro real fica gravada junto.
            </span>
          )}
        </label>

        <label style={campo}>
          <span style={rotulo}>Descrição</span>
          <textarea
            value={descricao}
            onChange={(e) => { setDescricao(e.target.value); marcarEdicao(); }}
            placeholder="O que foi observado, onde e em que condição (obrigatório)…"
            rows={3}
            style={{ ...inputStyle, fontSize: 15, resize: "vertical" }}
          />
        </label>

        {editando ? (
          <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5 }}>
            As fotos do desvio não são alteradas na edição.
          </div>
        ) : (
        <Card>
          <div style={rotulo}>Fotos ({fotos.length})</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8, marginBottom: 8 }}>
            {fotos.map((f, i) => (
              <div key={i} style={{ position: "relative" }}>
                <img src={f.preview} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8 }} />
                <button
                  onClick={() => setFotos((arr) => arr.filter((_, j) => j !== i))}
                  aria-label="Remover"
                  style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 999, border: "none", background: T.red, color: "#fff", fontWeight: 700, cursor: "pointer" }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          {fotos.length < MAX_FOTOS && (
            <CapturaFoto
              restante={MAX_FOTOS - fotos.length}
              onFotos={(novas) => setFotos((arr) => [...arr, ...novas].slice(0, MAX_FOTOS))}
            />
          )}
        </Card>
        )}

        {iaDisponivel && (fotos.length > 0 || triagem) && (
          <Card style={{ borderLeft: `4px solid ${T.yellow}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ ...rotulo, marginRight: "auto" }}>Triagem por IA (opcional)</span>
              {triagem && (
                <span style={{ background: "#FFF4D6", color: T.yellowDark, fontWeight: 700, fontSize: 11, padding: "3px 8px", borderRadius: 999 }}>
                  IA · revise
                </span>
              )}
            </div>
            {!editando && !triagem && !agendarAnalise && (
              <div style={{ marginTop: 8 }}>
                <Botao variante="fantasma" onClick={() => void analisarComIA()} disabled={analisando}>
                  {analisando ? "Analisando fotos…" : "🤖 Analisar com IA"}
                </Botao>
                <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 6, lineHeight: 1.5 }}>
                  A IA descreve o que é visível nas fotos (até {MAX_FOTOS_TRIAGEM}) e sugere
                  classificação, criticidade e a norma aplicável em nível de tema. A sugestão é
                  sempre sua para revisar — nada é salvo sem a sua confirmação.
                </div>
              </div>
            )}
            {agendarAnalise && !triagem && (
              <div style={{ fontSize: 13, color: T.yellowDark, fontWeight: 600, marginTop: 8 }}>
                ⏳ Análise agendada — roda quando o desvio sincronizar.
              </div>
            )}
            {avisoIa && (
              <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 6 }}>{avisoIa}</div>
            )}
            {triagem && (
              <div style={{ marginTop: 8, fontSize: 13, color: T.ink, lineHeight: 1.55 }}>
                <div><b>Visível nas fotos:</b> {triagem.descricao_visivel}</div>
                {triagem.familias_normativas.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <b>Normas (tema):</b> {triagem.familias_normativas.join(" · ")}
                  </div>
                )}
                {triagem.limitacoes && (
                  <div style={{ marginTop: 4, color: T.inkSoft }}>
                    <b>Não verificável pela imagem:</b> {triagem.limitacoes}
                  </div>
                )}
                <div style={{ marginTop: 6, fontSize: 12, color: T.inkSoft }}>
                  Sugestões aplicadas nos campos acima — ajuste o que precisar antes de salvar.
                </div>
                <button
                  onClick={limparSugestao}
                  style={{ marginTop: 8, background: "none", border: `1px solid ${T.line}`, color: T.inkSoft, fontWeight: 600, fontSize: 12.5, cursor: "pointer", borderRadius: 8, padding: "6px 10px" }}
                >
                  Limpar sugestão da IA
                </button>
              </div>
            )}
          </Card>
        )}

        <details>
          <summary style={{ ...rotulo, cursor: "pointer", padding: "4px 0" }}>
            Contratada, frente e cronograma (opcional)
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
            <label style={campo}>
              <span style={rotulo}>Contratada</span>
              <select value={contratadaId} onChange={(e) => setContratadaId(e.target.value)} style={inputStyle}>
                <option value="">—</option>
                {contratadas.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={campo}>
                <span style={rotulo}>Frente de serviço</span>
                <input value={frente} onChange={(e) => setFrente(e.target.value)} placeholder="Ex.: Bloco B" style={inputStyle} />
              </label>
              <label style={campo}>
                <span style={rotulo}>Item de cronograma</span>
                <input value={refCronograma} onChange={(e) => setRefCronograma(e.target.value)} placeholder="Ex.: 3.2.1" style={inputStyle} />
              </label>
            </div>
          </div>
        </details>

        <Botao onClick={salvar} disabled={!pronto}>
          {salvando ? "Salvando…" : editando ? "Salvar alterações" : "Salvar desvio"}
        </Botao>
        <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5 }}>
          Salva no aparelho na hora; havendo rede, sobe automaticamente. O desvio entra na base da
          Pirâmide de Bird junto das NCs de segurança das inspeções.
        </div>
      </div>
    </div>
  );
}

const campo = { display: "flex", flexDirection: "column", gap: 6 } as const;
const rotulo = { fontSize: 13, fontWeight: 600, color: T.inkSoft, fontFamily: FONT_HEAD, textTransform: "uppercase", letterSpacing: 0.3 } as const;

// Agora no fuso local no formato do <input type="datetime-local"> (YYYY-MM-DDTHH:mm).
function agoraInputLocal(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// ISO → formato do <input type="datetime-local"> no fuso local (para edição).
function paraInputLocal(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
