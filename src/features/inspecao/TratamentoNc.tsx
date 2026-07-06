import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Botao } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { db, type LocalEvento } from "@/lib/db";
import { processarFoto } from "@/lib/foto";
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
  const [foto, setFoto] = useState<{ blob: Blob; preview: string } | null>(null);
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
    setFoto(null);
    setErro(null);
  }

  async function escolherFoto(file: File | undefined) {
    if (!file) return;
    try {
      const { blob, preview } = await processarFoto(file);
      setFoto({ blob, preview });
    } catch {
      setErro("Não foi possível processar a foto.");
    }
  }

  async function confirmar() {
    setProcessando(true);
    setErro(null);
    let r: { error: string | null };
    if (acao === "tratar") r = await registrarTratamento(evento, texto.trim(), ator, foto?.blob);
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
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <label
                style={{
                  fontFamily: FONT_HEAD,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  fontSize: 13,
                  letterSpacing: 0.5,
                  border: `2px solid ${T.line}`,
                  borderRadius: 10,
                  padding: "9px 12px",
                  cursor: "pointer",
                  color: T.ink,
                }}
              >
                {foto ? "Trocar foto" : "Anexar foto"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: "none" }}
                  onChange={(e) => void escolherFoto(e.target.files?.[0])}
                />
              </label>
              {foto && (
                <img
                  src={foto.preview}
                  alt="Prévia"
                  style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8 }}
                />
              )}
            </div>
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
