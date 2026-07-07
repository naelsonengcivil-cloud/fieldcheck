import { useEffect, useState } from "react";
import { Botao } from "@/components/ui";
import { T, FONT_HEAD, FONT_BODY, corPorPct } from "@/theme";
import { db, type LocalInspecao, type LocalResposta, type LocalEvento } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { pctConformidade, dataInspecao, kpisDoConjunto } from "@/lib/obraView";
import { GraficoObra, type ModoGrafico } from "@/features/obra/GraficoObra";
import { ROTULO_STATUS, corStatus } from "@/lib/ncEstado";
import type { Checklist, ItemChecklist, NcTransicao } from "@/types/db";

// ============================================================
// Relatório imprimível (RF09 · PDF): tabela do filtro + gráfico +
// lista de NCs com fotos. window.print() permite "Salvar como PDF".
// (No empacotamento nativo do M8, vira print/compartilhamento nativo.)
// ============================================================

interface Props {
  obraNome: string;
  filtroDesc: string;
  filtradas: LocalInspecao[];
  idx: Map<string, LocalResposta[]>;
  ckMap: Map<string, Checklist>;
  usrMap: Map<string, string>;
  itemMap: Map<string, ItemChecklist>;
  eventoMap: Map<string, LocalEvento>;
  transicoesPorEvento?: Map<string, NcTransicao[]>;
  modo: ModoGrafico;
  onVoltar: () => void;
}

export function RelatorioObra({
  obraNome,
  filtroDesc,
  filtradas,
  idx,
  ckMap,
  usrMap,
  itemMap,
  eventoMap,
  transicoesPorEvento,
  modo,
  onVoltar,
}: Props) {
  const [fotos, setFotos] = useState<Record<string, string>>({});
  const [prontoFotos, setProntoFotos] = useState(false);

  // NCs de todas as inspeções filtradas.
  const ncs = filtradas.flatMap((insp) =>
    (idx.get(insp.id) ?? [])
      .filter((r) => r.resposta === "NC")
      .map((r) => ({ r, insp })),
  );
  // Itens Conformes (para a seção de evidências positivas).
  const conformes = filtradas.flatMap((insp) =>
    (idx.get(insp.id) ?? [])
      .filter((r) => r.resposta === "C")
      .map((r) => ({ r, insp })),
  );

  // Resolve as fotos (blob local → objectURL; url servidor → signed URL).
  useEffect(() => {
    let vivo = true;
    const criados: string[] = [];
    (async () => {
      const ids = [...ncs, ...conformes].map((x) => x.r.id);
      const map: Record<string, string> = {};
      if (ids.length) {
        const evs = await db.evidencias.where("resposta_id").anyOf(ids).toArray();
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
      }
      if (vivo) {
        setFotos(map);
        setProntoFotos(true);
      }
    })();
    return () => {
      vivo = false;
      criados.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Volta ao sair da impressão.
  useEffect(() => {
    const volta = () => onVoltar();
    window.addEventListener("afterprint", volta);
    return () => window.removeEventListener("afterprint", volta);
  }, [onVoltar]);

  const geradoEm = new Date().toLocaleString("pt-BR");
  const tot = kpisDoConjunto(filtradas, idx);

  return (
    <div style={{ padding: 24, fontFamily: FONT_BODY, color: "#111", background: "#fff", minHeight: "100vh" }}>
      <div className="no-print" style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <Botao
          onClick={() => {
            try {
              window.print();
            } catch {
              /* ambiente sem impressão */
            }
          }}
          style={{ width: "auto" }}
          disabled={!prontoFotos}
        >
          {prontoFotos ? "Imprimir / Salvar PDF" : "Preparando…"}
        </Botao>
        <Botao variante="fantasma" onClick={onVoltar} style={{ width: "auto" }}>
          Voltar
        </Botao>
      </div>

      <div style={{ borderBottom: "4px solid #16181B", paddingBottom: 10, marginBottom: 14 }}>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 26, fontWeight: 700, textTransform: "uppercase" }}>
          Relatório de Inspeções — {obraNome}
        </div>
        <div style={{ fontSize: 12.5, color: "#555" }}>
          Filtro: {filtroDesc} · Inspeções: {tot.nInspecoes} · Pontos inspecionados:{" "}
          {tot.pontos} · Gerado em {geradoEm} · FieldCheck
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginBottom: 16 }}>
        <thead>
          <tr>
            {["Data", "Checklist", "Inspetor", "Conf.", "NC", "N/A", "% Conform."].map((h) => (
              <th key={h} style={{ border: "1px solid #999", padding: "6px 8px", background: "#EFEFEA", textAlign: "left" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtradas.map((insp) => {
            const rs = idx.get(insp.id) ?? [];
            const c = rs.filter((r) => r.resposta === "C").length;
            const nc = rs.filter((r) => r.resposta === "NC").length;
            const na = rs.filter((r) => r.resposta === "NA").length;
            const ck = ckMap.get(insp.checklist_id);
            const pct = pctConformidade(c, nc);
            return (
              <tr key={insp.id}>
                <td style={td}>{dataInspecao(insp).split("-").reverse().join("/")}</td>
                <td style={td}>
                  {ck?.codigo} · {ck?.nome}
                </td>
                <td style={td}>{usrMap.get(insp.inspetor_id) ?? "—"}</td>
                <td style={td}>{c}</td>
                <td style={{ ...td, color: T.red, fontWeight: 700 }}>{nc}</td>
                <td style={td}>{na}</td>
                <td style={{ ...td, fontWeight: 700, color: corPorPct(pct) }}>{pct}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ maxWidth: 620, margin: "0 auto 18px" }}>
        <GraficoObra modo={modo} filtradas={filtradas} idx={idx} ckMap={ckMap} />
      </div>

      {ncs.length > 0 && (
        <>
          <div
            style={{
              fontFamily: FONT_HEAD,
              fontSize: 18,
              fontWeight: 700,
              textTransform: "uppercase",
              margin: "10px 0 8px",
              color: T.red,
            }}
          >
            Não conformidades ({ncs.length})
          </div>
          {ncs.map(({ r, insp }) => {
            const ev = eventoMap.get(r.id);
            const trs = ev ? (transicoesPorEvento?.get(ev.id) ?? []) : [];
            const foto = fotos[r.id];
            return (
              <div
                key={r.id}
                style={{ display: "flex", gap: 12, borderTop: "1px solid #ccc", padding: "8px 0", breakInside: "avoid" }}
              >
                {foto && (
                  <img src={foto} alt="" style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 6 }} />
                )}
                <div style={{ fontSize: 12.5 }}>
                  <b>
                    {ckMap.get(insp.checklist_id)?.codigo} · {itemMap.get(r.item_id)?.texto}
                  </b>{" "}
                  <span style={{ color: "#555" }}>
                    ({dataInspecao(insp).split("-").reverse().join("/")})
                  </span>
                  <div>{r.observacao}</div>
                  <div style={{ color: "#555" }}>
                    {ev?.responsavel ? `Responsável: ${ev.responsavel}` : ""}
                    {ev?.prazo ? ` · Prazo: ${ev.prazo.split("-").reverse().join("/")}` : ""}
                  </div>
                  {ev && (
                    <div style={{ marginTop: 3 }}>
                      <span style={{ fontWeight: 700, color: corStatus(ev.status).fg }}>
                        {ROTULO_STATUS[ev.status]}
                      </span>
                      {ev.tratamento ? ` — Tratamento: ${ev.tratamento}` : ""}
                    </div>
                  )}
                  {trs.length > 0 && (
                    <div style={{ marginTop: 2, color: "#555", fontSize: 11.5 }}>
                      {trs.map((t) => (
                        <div key={t.id}>
                          • {ROTULO_STATUS[t.para_status].split(" ·")[0]} — {t.ator_nome ?? "—"} ·{" "}
                          {new Date(t.criado_em).toLocaleDateString("pt-BR")}
                          {t.comentario ? `: "${t.comentario}"` : ""}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}

      {conformes.some(({ r }) => fotos[r.id]) && (
        <>
          <div
            style={{
              fontFamily: FONT_HEAD,
              fontSize: 18,
              fontWeight: 700,
              textTransform: "uppercase",
              margin: "14px 0 8px",
              color: T.green,
            }}
          >
            Evidências de conformidade
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {conformes
              .filter(({ r }) => fotos[r.id])
              .map(({ r, insp }) => (
                <div key={r.id} style={{ width: 150, breakInside: "avoid" }}>
                  <img
                    src={fotos[r.id]}
                    alt=""
                    style={{ width: 150, height: 110, objectFit: "cover", borderRadius: 6 }}
                  />
                  <div style={{ fontSize: 10.5, color: "#555", marginTop: 2 }}>
                    {ckMap.get(insp.checklist_id)?.codigo} · {itemMap.get(r.item_id)?.texto}
                  </div>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

const td = { border: "1px solid #bbb", padding: "5px 8px" } as const;
