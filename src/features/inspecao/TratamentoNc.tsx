import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Botao } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { db, type LocalEvento } from "@/lib/db";
import { CapturaFoto } from "@/features/inspecao/CapturaFoto";
import {
  acoesDisponiveis,
  corStatus,
  ROTULO_STATUS,
  type AcaoNc,
} from "@/lib/ncEstado";
import {
  registrarTratamento,
  aprovarTratamento,
  reprovarTratamento,
  type Ator,
} from "@/lib/ncCiclo";
import { MAX_FOTOS, type FotoLocal } from "@/lib/inspecaoService";
import type { Papel } from "@/types/db";

// ============================================================
// Ciclo de tratamento de uma NC (Marco B1) — dentro do card da NC no
// detalhe. Mostra o status atual, o histórico das transições e as ações
// disponíveis conforme o papel (executora trata; gestor/admin aprova/reprova).
// ============================================================

const fmtData = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

const campo = {
  width: "100%",
  boxSizing: "border-box",
  border: `2px solid ${T.line}`,
  borderRadius: 10,
  padding: 10,
  fontSize: 14.5,
  resize: "vertical",
} as const;

export function TratamentoNc({
  evento,
  papel,
  ator,
}: {
  evento: LocalEvento;
  papel: Papel;
  ator: Ator;
}) {
  const [acao, setAcao] = useState<AcaoNc | null>(null);
  const [texto, setTexto] = useState("");
  const [fotos, setFotos] = useState<FotoLocal[]>([]); // até MAX_FOTOS (melhoria 5)
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const transicoes = useLiveQuery(
    () => db.nc_transicoes.where("evento_id").equals(evento.id).sortBy("criado_em"),
    [evento.id],
    [],
  );

  const acoes = useMemo(() => acoesDisponiveis(evento.status, papel), [evento.status, papel]);
  const cor = corStatus(evento.status);

  function fechar() {
    setAcao(null);
    setTexto("");
    setFotos([]);
    setErro(null);
  }

  function addFotos(novas: FotoLocal[]) {
    setFotos((prev) => {
      const vagas = MAX_FOTOS - prev.length;
      return vagas <= 0 ? prev : [...prev, ...novas.slice(0, vagas)];
    });
  }
  function removerFoto(k: number) {
    setFotos((prev) => prev.filter((_, i) => i !== k));
  }

  async function confirmar() {
    setProcessando(true);
    setErro(null);
    let r: { error: string | null };
    if (acao === "tratar") r = await registrarTratamento(evento, texto.trim(), ator, fotos);
    else if (acao === "aprovar") r = await aprovarTratamento(evento, ator, texto);
    else r = await reprovarTratamento(evento, ator, texto.trim());
    setProcessando(false);
    if (r.error) setErro(r.error);
    else fechar();
  }

  const rotuloAcao: Record<AcaoNc, string> = {
    tratar: evento.status === "reaberta" ? "Reenviar tratamento" : "Registrar tratamento",
    aprovar: "Aprovar",
    reprovar: "Reprovar",
  };
  // 'tratar' e 'reprovar' exigem texto; 'aprovar' o comentário é opcional.
  const textoObrigatorio = acao === "tratar" || acao === "reprovar";
  const podeConfirmar = !processando && (!textoObrigatorio || texto.trim().length > 0);

  return (
    <div style={{ marginTop: 10, borderTop: `1px dashed ${T.line}`, paddingTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span
          style={{
            fontFamily: FONT_HEAD,
            fontWeight: 700,
            fontSize: 12.5,
            textTransform: "uppercase",
            letterSpacing: 0.4,
            color: cor.fg,
            background: cor.bg,
            padding: "3px 9px",
            borderRadius: 999,
          }}
        >
          {ROTULO_STATUS[evento.status]}
        </span>
      </div>

      {evento.tratamento && (
        <div style={{ marginTop: 8, fontSize: 13, color: T.ink }}>
          <b style={{ color: T.inkSoft }}>Tratamento: </b>
          {evento.tratamento}
        </div>
      )}

      {/* histórico */}
      {transicoes.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {transicoes.map((t) => (
            <div key={t.id} style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.45 }}>
              <span style={{ color: corStatus(t.para_status).fg, fontWeight: 700 }}>
                {ROTULO_STATUS[t.para_status].split(" ·")[0]}
              </span>
              {" · "}
              {t.ator_nome ?? "—"} · {fmtData(t.criado_em)}
              {t.comentario && (
                <div style={{ color: T.ink, marginLeft: 2 }}>“{t.comentario}”</div>
              )}
            </div>
          ))}
        </div>
      )}

      {erro && (
        <div style={{ background: T.redBg, color: T.red, borderRadius: 8, padding: "7px 9px", fontSize: 13, fontWeight: 600, marginTop: 8 }}>
          {erro}
        </div>
      )}

      {/* ações */}
      {acao === null && acoes.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {acoes.map((a) => (
            <div key={a} style={{ flex: a === "tratar" ? "1 1 100%" : 1, minWidth: 120 }}>
              <Botao
                variante={a === "aprovar" ? "escuro" : "fantasma"}
                style={
                  a === "aprovar"
                    ? { background: T.green }
                    : a === "reprovar"
                      ? { color: T.red, borderColor: T.red }
                      : {}
                }
                onClick={() => { setAcao(a); setErro(null); }}
              >
                {rotuloAcao[a]}
              </Botao>
            </div>
          ))}
        </div>
      )}

      {acao !== null && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={2}
            placeholder={
              acao === "tratar"
                ? "Descreva o tratamento aplicado (obrigatório)"
                : acao === "reprovar"
                  ? "Motivo da reprovação (obrigatório)"
                  : "Comentário da aprovação (opcional)"
            }
            style={campo}
          />
          {acao === "tratar" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {fotos.map((f, k) => (
                <div key={k} style={{ position: "relative" }}>
                  <img
                    src={f.preview}
                    alt={`Foto ${k + 1}`}
                    style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: `2px solid ${T.line}` }}
                  />
                  <button
                    type="button"
                    onClick={() => removerFoto(k)}
                    aria-label="Remover foto"
                    style={{
                      position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 999,
                      background: T.red, color: "#fff", border: "2px solid #fff", cursor: "pointer",
                      fontSize: 12, lineHeight: 1, fontWeight: 700, padding: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {acao === "tratar" && fotos.length < MAX_FOTOS && (
            <CapturaFoto restante={MAX_FOTOS - fotos.length} onFotos={addFotos} />
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <Botao
              disabled={!podeConfirmar}
              style={acao === "aprovar" ? { background: T.green, color: "#fff" } : acao === "reprovar" ? { background: T.red, color: "#fff" } : {}}
              onClick={() => void confirmar()}
            >
              {processando ? "Enviando…" : rotuloAcao[acao]}
            </Botao>
            <Botao variante="fantasma" onClick={fechar}>Cancelar</Botao>
          </div>
        </div>
      )}
    </div>
  );
}
