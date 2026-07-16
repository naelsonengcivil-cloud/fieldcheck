import { useRef, useState } from "react";
import { Botao, Header } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { processarFoto } from "@/lib/foto";
import { capturarFotoNativa } from "@/lib/plataforma";
import {
  avaliarExecucao,
  ehChecklistST,
  MAX_FOTOS,
  type ExecInspecao,
  type ExecItem,
  type FotoLocal,
} from "@/lib/inspecaoService";
import { CRITICIDADES, ROTULO_CRIT, corCriticidade, prazoSugerido } from "@/lib/criticidade";
import { useAuth } from "@/features/auth/AuthProvider";
import type { Resposta, ClassificacaoST } from "@/types/db";

// ============================================================
// Execução (RF04/RF05): resposta C/NC/NA por item; NC exige observação
// e permite foto (câmera), responsável e prazo. Finaliza só se a regra
// passar. UX/estilo do protótipo validado.
// NC de checklist de Segurança do Trabalho (ST) exige classificação
// (base da Pirâmide de Bird, Marco A2).
// ============================================================

const OPCOES: [Resposta, string, string, string][] = [
  ["C", "Conforme", T.green, T.greenBg],
  ["NC", "Não conf.", T.red, T.redBg],
  ["NA", "N/A", T.gray, T.grayBg],
];

const CLASS_ST: [ClassificacaoST, string][] = [
  ["ato_inseguro", "Ato inseguro"],
  ["condicao_insegura", "Condição insegura"],
  ["quase_acidente", "Quase acidente"],
  ["na", "N/A (documental)"],
];

export function Execucao({
  execInicial,
  onBack,
  onFinalizar,
}: {
  execInicial: ExecInspecao;
  onBack: () => void;
  onFinalizar: (exec: ExecInspecao) => void;
}) {
  const { empresa } = useAuth();
  const [exec, setExec] = useState<ExecInspecao>(execInicial);
  const ehST = ehChecklistST(exec.checklist);
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});

  function patch(idx: number, campo: Partial<ExecItem>) {
    setExec((prev) => {
      const itens = prev.itens.slice();
      itens[idx] = { ...itens[idx], ...campo };
      return { ...prev, itens };
    });
  }

  // Seleciona a criticidade da NC e sugere o prazo (mantém prazo já editado).
  function selecionarCriticidade(idx: number, c: ExecItem["criticidade"]) {
    setExec((prev) => {
      const itens = prev.itens.slice();
      const atual = itens[idx];
      const jaTinha = !!atual.prazo;
      // Prazo conta a partir da DATA DA INSPEÇÃO (informada), não de hoje (melhoria A).
      const base = prev.data_inspecao ? new Date(prev.data_inspecao) : new Date();
      const prazo = c && !jaTinha ? prazoSugerido(c, empresa?.prazos_nc, base) : atual.prazo;
      itens[idx] = { ...atual, criticidade: c, prazo };
      return { ...prev, itens };
    });
  }

  const respondidos = exec.itens.filter((i) => i.resposta).length;
  const total = exec.itens.length;
  const avaliacao = avaliarExecucao(exec);

  // Até MAX_FOTOS por item (melhoria 5): append/remove seguros (funcionais).
  function addFoto(idx: number, foto: FotoLocal) {
    setExec((prev) => {
      const itens = prev.itens.slice();
      if (itens[idx].fotos.length >= MAX_FOTOS) return prev;
      itens[idx] = { ...itens[idx], fotos: [...itens[idx].fotos, foto] };
      return { ...prev, itens };
    });
  }
  function removeFoto(idx: number, fotoIdx: number) {
    setExec((prev) => {
      const itens = prev.itens.slice();
      itens[idx] = { ...itens[idx], fotos: itens[idx].fotos.filter((_, k) => k !== fotoIdx) };
      return { ...prev, itens };
    });
  }

  async function escolherFoto(idx: number, file: Blob) {
    try {
      const { blob, preview } = await processarFoto(file);
      addFoto(idx, { blob, preview });
    } catch {
      /* imagem inválida — ignora */
    }
  }

  // Câmera nativa (Capacitor) quando empacotado; senão, o input de arquivo web.
  async function registrarFoto(idx: number) {
    try {
      const nativa = await capturarFotoNativa();
      if (nativa) {
        await escolherFoto(idx, nativa);
        return;
      }
    } catch {
      /* usuário cancelou a câmera nativa */
      return;
    }
    fileRefs.current[idx]?.click();
  }

  // Bloco de captura de foto (reusado em NC e em Conforme).
  function blocoFoto(i: number, label: string) {
    const r = exec.itens[i];
    return (
      <>
        <input
          ref={(el) => {
            fileRefs.current[i] = el;
          }}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void escolherFoto(i, f);
            e.target.value = ""; // permite re-selecionar a mesma foto
          }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {r.fotos.map((foto, k) => (
            <div key={k} style={{ position: "relative" }}>
              <img
                src={foto.preview}
                alt={`Evidência ${k + 1}`}
                style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10, border: `2px solid ${T.line}` }}
              />
              <button
                onClick={() => removeFoto(i, k)}
                aria-label="Remover foto"
                style={{
                  position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 999,
                  background: T.red, color: "#fff", border: "2px solid #fff", cursor: "pointer",
                  fontSize: 14, lineHeight: 1, fontWeight: 700, padding: 0,
                }}
              >
                ×
              </button>
            </div>
          ))}
          {r.fotos.length < MAX_FOTOS && (
            <button
              onClick={() => void registrarFoto(i)}
              title={label}
              style={{
                width: 72, height: 72, border: `2px dashed ${T.yellowDark}`, background: "#FFF8E6",
                color: T.yellowDark, borderRadius: 10, fontWeight: 700, cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
              }}
            >
              <span style={{ fontSize: 22, lineHeight: 1 }}>＋</span>
              <span style={{ fontSize: 10 }}>
                {r.fotos.length === 0 ? "Foto" : `${r.fotos.length}/${MAX_FOTOS}`}
              </span>
            </button>
          )}
        </div>
      </>
    );
  }

  return (
    <div>
      <Header
        titulo={exec.checklist.codigo}
        sub={`${exec.checklist.nome} · ${exec.obra.nome}`}
        onBack={onBack}
        right={
          <div
            style={{
              fontFamily: FONT_HEAD,
              fontSize: 20,
              fontWeight: 700,
              color: T.yellow,
            }}
          >
            {respondidos}/{total}
          </div>
        }
      />
      <div style={{ height: 5, background: T.line }}>
        <div
          style={{
            height: 5,
            width: `${total ? (respondidos / total) * 100 : 0}%`,
            background: T.yellow,
            transition: "width .25s",
          }}
        />
      </div>

      <div
        style={{
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          paddingBottom: 120,
        }}
      >
        {exec.itens.map((r, i) => (
          <div
            key={r.item_id}
            style={{
              background: T.card,
              borderRadius: 14,
              border: `1px solid ${T.line}`,
              borderLeft: `5px solid ${
                r.resposta === "C"
                  ? T.green
                  : r.resposta === "NC"
                    ? T.red
                    : r.resposta === "NA"
                      ? T.gray
                      : T.line
              }`,
              padding: 14,
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
              <span
                style={{
                  fontFamily: FONT_HEAD,
                  fontWeight: 700,
                  color: T.inkSoft,
                  fontSize: 15,
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.35 }}>
                {r.texto}
              </span>
            </div>
            {r.criterio && (
              <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 4, marginLeft: 26 }}>
                {r.criterio}
              </div>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 8,
                marginTop: 12,
              }}
            >
              {OPCOES.map(([v, lbl, cor, corBg]) => {
                const sel = r.resposta === v;
                return (
                  <button
                    key={v}
                    onClick={() => patch(i, { resposta: sel ? "" : v })}
                    style={{
                      padding: "13px 4px",
                      borderRadius: 10,
                      cursor: "pointer",
                      fontFamily: FONT_HEAD,
                      fontWeight: 700,
                      fontSize: 15,
                      textTransform: "uppercase",
                      border: sel ? `2px solid ${cor}` : `2px solid ${T.line}`,
                      background: sel ? corBg : "#fff",
                      color: sel ? cor : T.inkSoft,
                    }}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>

            {r.resposta === "NC" && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                {ehST && (
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: r.classificacao_st ? T.inkSoft : T.red, marginBottom: 6 }}>
                      Classificação de segurança (Pirâmide de Bird) *
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                      {CLASS_ST.map(([v, lbl]) => {
                        const sel = r.classificacao_st === v;
                        return (
                          <button
                            key={v}
                            onClick={() => patch(i, { classificacao_st: v })}
                            style={{
                              padding: "9px 4px",
                              borderRadius: 9,
                              cursor: "pointer",
                              fontSize: 12.5,
                              fontWeight: 700,
                              border: sel ? `2px solid ${T.yellowDark}` : `2px solid ${r.classificacao_st ? T.line : T.red}`,
                              background: sel ? "#FFF4D6" : "#fff",
                              color: sel ? T.yellowDark : T.inkSoft,
                              lineHeight: 1.15,
                            }}
                          >
                            {lbl}
                          </button>
                        );
                      })}
                    </div>
                    {r.classificacao_st === "na" && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: r.classificacao_st_justificativa.trim() ? T.inkSoft : T.red, marginBottom: 6 }}>
                          Justificativa do N/A *
                        </div>
                        <textarea
                          value={r.classificacao_st_justificativa}
                          onChange={(e) => patch(i, { classificacao_st_justificativa: e.target.value })}
                          placeholder="Por que este item é documental e não se encaixa na pirâmide?"
                          rows={2}
                          style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "10px 8px", fontSize: 14, resize: "vertical", border: `2px solid ${r.classificacao_st_justificativa.trim() ? T.line : T.red}` }}
                        />
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: r.criticidade ? T.inkSoft : T.red, marginBottom: 6 }}>
                    Criticidade *
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
                    {CRITICIDADES.map((c) => {
                      const sel = r.criticidade === c;
                      const cor = corCriticidade(c);
                      return (
                        <button
                          key={c}
                          onClick={() => selecionarCriticidade(i, sel ? "" : c)}
                          style={{
                            padding: "9px 2px",
                            borderRadius: 9,
                            cursor: "pointer",
                            fontSize: 12,
                            fontWeight: 700,
                            border: sel ? `2px solid ${cor.fg}` : `2px solid ${r.criticidade ? T.line : T.red}`,
                            background: sel ? cor.bg : "#fff",
                            color: sel ? cor.fg : T.inkSoft,
                            lineHeight: 1.15,
                          }}
                        >
                          {ROTULO_CRIT[c]}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <textarea
                  value={r.observacao}
                  onChange={(e) => patch(i, { observacao: e.target.value })}
                  placeholder="Descreva o desvio (obrigatório)…"
                  rows={2}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    border: `2px solid ${r.observacao.trim() ? T.line : T.red}`,
                    borderRadius: 10,
                    padding: 10,
                    fontSize: 14.5,
                    resize: "vertical",
                  }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={r.responsavel}
                    onChange={(e) => patch(i, { responsavel: e.target.value })}
                    placeholder="Responsável"
                    style={{
                      flex: 1,
                      border: `2px solid ${T.line}`,
                      borderRadius: 10,
                      padding: 10,
                      fontSize: 14.5,
                      minWidth: 0,
                    }}
                  />
                  <input
                    type="date"
                    value={r.prazo}
                    onChange={(e) => patch(i, { prazo: e.target.value })}
                    style={{
                      flex: 1,
                      border: `2px solid ${r.prazo ? T.line : T.red}`,
                      borderRadius: 10,
                      padding: 10,
                      fontSize: 14,
                      minWidth: 0,
                    }}
                  />
                </div>
                {blocoFoto(i, "📷 Registrar evidência fotográfica")}
              </div>
            )}

            {r.resposta === "C" && (
              <div style={{ marginTop: 12 }}>
                {blocoFoto(i, "📷 Evidência de conformidade (opcional)")}
              </div>
            )}
          </div>
        ))}
      </div>

      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "12px 14px 18px",
          background: "linear-gradient(transparent, rgba(244,244,241,0.96) 30%)",
        }}
      >
        <div style={{ maxWidth: 520, margin: "0 auto" }}>
          <Botao
            variante="escuro"
            disabled={!avaliacao.ok}
            onClick={() => onFinalizar(exec)}
          >
            {avaliacao.ok ? "Finalizar inspeção ✓" : avaliacao.motivo}
          </Botao>
        </div>
      </div>
    </div>
  );
}
