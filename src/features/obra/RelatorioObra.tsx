import { useEffect, useState } from "react";
import { Botao } from "@/components/ui";
import { T, FONT_HEAD, FONT_BODY, corPorPct } from "@/theme";
import { db, type LocalInspecao, type LocalResposta, type LocalEvento } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { pctConformidade, dataInspecao, kpisDoConjunto, ehRegistroRetroativo } from "@/lib/obraView";
import { GraficoObra, type ModoGrafico } from "@/features/obra/GraficoObra";
import { ROTULO_STATUS, corStatus } from "@/lib/ncEstado";
import { ROTULO_CRIT, corCriticidade, vencida } from "@/lib/criticidade";
import { PiramideBird } from "@/features/seguranca/PiramideBird";
import { CabecalhoRelatorio, RodapeFieldCheck } from "@/features/relatorio/CabecalhoRelatorio";
import { useAuth } from "@/features/auth/AuthProvider";
import type { KpisBird } from "@/lib/piramideBird";
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
  kpisBird?: KpisBird;
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
  kpisBird,
  modo,
  onVoltar,
}: Props) {
  const { empresa } = useAuth();
  const [fotos, setFotos] = useState<Record<string, string[]>>({});
  const [prontoFotos, setProntoFotos] = useState(false);

  // Inspetor(es) do recorte (distintos), para o cabeçalho.
  const inspetores = [...new Set(filtradas.map((i) => usrMap.get(i.inspetor_id)).filter(Boolean) as string[])];

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
      const map: Record<string, string[]> = {};
      const add = (rid: string, url: string) => ((map[rid] ??= []).push(url));
      if (ids.length) {
        const evs = await db.evidencias.where("resposta_id").anyOf(ids).toArray();
        for (const ev of evs) {
          if (!ev.resposta_id) continue;
          if (ev.blob) {
            const u = URL.createObjectURL(ev.blob);
            criados.push(u);
            add(ev.resposta_id, u);
          } else if (ev.url) {
            const { data } = await supabase.storage
              .from("evidencias")
              .createSignedUrl(ev.url, 3600);
            if (data?.signedUrl) add(ev.resposta_id, data.signedUrl);
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
    <div style={{ padding: "24px 24px 56px", fontFamily: FONT_BODY, color: "#111", background: "#fff", minHeight: "100vh" }}>
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

      <CabecalhoRelatorio
        empresaNome={empresa?.nome ?? "FieldCheck"}
        logoUrl={empresa?.logo_url}
        titulo={`Relatório de Inspeções — ${obraNome}`}
        inspetores={inspetores}
        metaLinha={`Filtro: ${filtroDesc} · Inspeções: ${tot.nInspecoes} · Pontos inspecionados: ${tot.pontos} · Gerado em ${geradoEm}`}
      />

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
                <td style={td}>
                  {dataInspecao(insp).split("-").reverse().join("/")}
                  {ehRegistroRetroativo(insp) && (
                    <div style={{ fontSize: 9.5, color: "#B8860B" }} title="Registro retroativo">
                      reg. {(insp.registrado_em ?? insp.finalizada_em ?? "").slice(0, 10).split("-").reverse().join("/")}
                    </div>
                  )}
                </td>
                <td style={td}>
                  {ck?.codigo} · {ck?.nome}
                  {insp.projeto_ref_numero && (
                    <div style={{ fontSize: 10.5, color: "#777" }}>
                      Proj. {insp.projeto_ref_numero}
                      {insp.projeto_ref_revisao ? ` rev ${insp.projeto_ref_revisao}` : ""}
                    </div>
                  )}
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

      {kpisBird && (
        <div style={{ breakInside: "avoid", margin: "6px 0 16px" }}>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 18, fontWeight: 700, textTransform: "uppercase", margin: "10px 0 8px" }}>
            Pirâmide de Bird do período
          </div>
          <div style={{ maxWidth: 460, margin: "0 auto" }}>
            <PiramideBird kpis={kpisBird} />
          </div>
        </div>
      )}

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
                {foto && foto.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, flexShrink: 0 }}>
                    {foto.map((u, k) => (
                      <img key={k} src={u} alt="" style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 6 }} />
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 12.5 }}>
                  <b>
                    {ckMap.get(insp.checklist_id)?.codigo} · {itemMap.get(r.item_id)?.texto}
                  </b>{" "}
                  <span style={{ color: "#555" }}>
                    ({dataInspecao(insp).split("-").reverse().join("/")})
                  </span>
                  <div>{r.observacao}</div>
                  {r.classificacao_st === "na" && r.classificacao_st_justificativa && (
                    <div style={{ color: "#555", fontStyle: "italic" }}>
                      N/A (fora da pirâmide) — {r.classificacao_st_justificativa}
                    </div>
                  )}
                  <div style={{ color: "#555" }}>
                    {ev?.responsavel ? `Responsável: ${ev.responsavel}` : ""}
                    {ev?.prazo ? ` · Prazo: ${ev.prazo.split("-").reverse().join("/")}` : ""}
                    {ev && vencida(ev.prazo, ev.status) ? (
                      <b style={{ color: T.red }}> · VENCIDA</b>
                    ) : ""}
                  </div>
                  {ev && (
                    <div style={{ marginTop: 3 }}>
                      {ev.criticidade && (
                        <span
                          style={{
                            fontWeight: 700,
                            color: corCriticidade(ev.criticidade).fg,
                            marginRight: 8,
                          }}
                        >
                          {ROTULO_CRIT[ev.criticidade].toUpperCase()}
                        </span>
                      )}
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
              .filter(({ r }) => fotos[r.id]?.length)
              .map(({ r, insp }) => (
                <div key={r.id} style={{ width: 150, breakInside: "avoid" }}>
                  {(fotos[r.id] ?? []).map((u, k) => (
                    <img
                      key={k}
                      src={u}
                      alt=""
                      style={{ width: 150, height: 110, objectFit: "cover", borderRadius: 6, marginBottom: 4 }}
                    />
                  ))}
                  <div style={{ fontSize: 10.5, color: "#555", marginTop: 2 }}>
                    {ckMap.get(insp.checklist_id)?.codigo} · {itemMap.get(r.item_id)?.texto}
                  </div>
                </div>
              ))}
          </div>
        </>
      )}

      {filtradas.some((i) => i.assinatura) && (
        <div style={{ marginTop: 20, breakInside: "avoid" }}>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 18, fontWeight: 700, textTransform: "uppercase", margin: "10px 0 10px" }}>
            Assinaturas
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
            {filtradas
              .filter((i) => i.assinatura)
              .map((i) => (
                <div key={i.id} style={{ width: 240, breakInside: "avoid" }}>
                  <img
                    src={i.assinatura as string}
                    alt="Assinatura"
                    style={{ width: 240, height: 90, objectFit: "contain", borderBottom: "1px solid #333" }}
                  />
                  <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>
                    {usrMap.get(i.inspetor_id) ?? "Inspetor"}
                  </div>
                  <div style={{ fontSize: 11, color: "#555" }}>
                    {ckMap.get(i.checklist_id)?.codigo} · {dataInspecao(i).split("-").reverse().join("/")}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      <RodapeFieldCheck />
    </div>
  );
}

const td = { border: "1px solid #bbb", padding: "5px 8px" } as const;
