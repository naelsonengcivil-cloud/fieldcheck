import { useRef, useState } from "react";
import { Botao, Header } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { processarFoto } from "@/lib/foto";
import {
  avaliarExecucao,
  type ExecInspecao,
  type ExecItem,
} from "@/lib/inspecaoService";
import type { Resposta } from "@/types/db";

// ============================================================
// Execução (RF04/RF05): resposta C/NC/NA por item; NC exige observação
// e permite foto (câmera), responsável e prazo. Finaliza só se a regra
// passar. UX/estilo do protótipo validado.
// ============================================================

const OPCOES: [Resposta, string, string, string][] = [
  ["C", "Conforme", T.green, T.greenBg],
  ["NC", "Não conf.", T.red, T.redBg],
  ["NA", "N/A", T.gray, T.grayBg],
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
  const [exec, setExec] = useState<ExecInspecao>(execInicial);
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});

  function patch(idx: number, campo: Partial<ExecItem>) {
    setExec((prev) => {
      const itens = prev.itens.slice();
      itens[idx] = { ...itens[idx], ...campo };
      return { ...prev, itens };
    });
  }

  const respondidos = exec.itens.filter((i) => i.resposta).length;
  const total = exec.itens.length;
  const avaliacao = avaliarExecucao(exec);

  async function escolherFoto(idx: number, file: File) {
    try {
      const { blob, preview } = await processarFoto(file);
      patch(idx, { fotoBlob: blob, fotoPreview: preview });
    } catch {
      /* imagem inválida — ignora */
    }
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
                      border: `2px solid ${T.line}`,
                      borderRadius: 10,
                      padding: 10,
                      fontSize: 14,
                      minWidth: 0,
                    }}
                  />
                </div>
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
                  }}
                />
                {r.fotoPreview ? (
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <img
                      src={r.fotoPreview}
                      alt="Evidência"
                      style={{
                        width: 84,
                        height: 84,
                        objectFit: "cover",
                        borderRadius: 10,
                        border: `2px solid ${T.line}`,
                      }}
                    />
                    <button
                      onClick={() => patch(i, { fotoBlob: null, fotoPreview: null })}
                      style={{
                        background: "none",
                        border: "none",
                        color: T.red,
                        fontWeight: 700,
                        cursor: "pointer",
                        fontSize: 14,
                      }}
                    >
                      Remover foto
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileRefs.current[i]?.click()}
                    style={{
                      border: `2px dashed ${T.yellowDark}`,
                      background: "#FFF8E6",
                      color: T.yellowDark,
                      borderRadius: 10,
                      padding: "12px 10px",
                      fontWeight: 700,
                      fontSize: 14.5,
                      cursor: "pointer",
                    }}
                  >
                    📷 Registrar evidência fotográfica
                  </button>
                )}
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
