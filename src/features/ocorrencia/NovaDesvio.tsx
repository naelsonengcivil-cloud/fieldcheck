import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Botao, Card, Header, inputStyle } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { db } from "@/lib/db";
import { CapturaFoto } from "@/features/inspecao/CapturaFoto";
import { MAX_FOTOS, type FotoLocal } from "@/lib/inspecaoService";
import { ROTULO_OCORRENCIA, TIPOS_DESVIO, type DadosOcorrencia } from "@/lib/ocorrenciaService";
import { CRITICIDADES, ROTULO_CRIT, corCriticidade } from "@/lib/criticidade";
import { aceitaNovaInspecao } from "@/lib/obraStatus";
import type { Criticidade, TipoDesvio } from "@/types/db";

// ============================================================
// Registrar desvio (Marco M · M-1) — coleta rápida da BASE da Pirâmide de
// Bird: ato inseguro / condição insegura / quase acidente. Formulário
// mínimo, 100% offline (mesma fila das ocorrências). Data/hora editável
// (padrão retroativo do sistema, nunca futura). Contratada, frente e item
// de cronograma (EAP) são eixos opcionais para BI/alertas.
// ============================================================

export function NovaDesvio({
  obraInicial,
  onBack,
  onSalvar,
  salvando,
}: {
  /** Pré-seleciona a obra quando o registro nasce de dentro dela. */
  obraInicial?: string | null;
  onBack: () => void;
  onSalvar: (dados: DadosOcorrencia) => void;
  salvando: boolean;
}) {
  const obrasCache = useLiveQuery(() => db.obras.toArray(), [], []);
  const obras = useMemo(() => obrasCache.filter((o) => aceitaNovaInspecao(o.status)), [obrasCache]);
  const contratadasCache = useLiveQuery(() => db.contratadas.toArray(), [], []);
  const contratadas = contratadasCache.filter((c) => c.ativa);

  const [obraId, setObraId] = useState(obraInicial ?? "");
  const [tipo, setTipo] = useState<TipoDesvio | null>(null);
  const [criticidade, setCriticidade] = useState<Criticidade | null>(null);
  const [quando, setQuando] = useState(agoraInputLocal());
  const [descricao, setDescricao] = useState("");
  const [contratadaId, setContratadaId] = useState("");
  const [frente, setFrente] = useState("");
  const [refCronograma, setRefCronograma] = useState("");
  const [fotos, setFotos] = useState<FotoLocal[]>([]);

  const retroativo = quando.slice(0, 10) < agoraInputLocal().slice(0, 10);
  const pronto = !!obraId && !!tipo && !!criticidade && descricao.trim().length > 0 && !salvando;

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
    });
  }

  return (
    <div>
      <Header titulo="Registrar desvio" sub="Base da Pirâmide de Bird — registro rápido" onBack={onBack} />
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
                onClick={() => setTipo(t)}
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
                  onClick={() => setCriticidade(c)}
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
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="O que foi observado, onde e em que condição (obrigatório)…"
            rows={3}
            style={{ ...inputStyle, fontSize: 15, resize: "vertical" }}
          />
        </label>

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
          {salvando ? "Salvando…" : "Salvar desvio"}
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
