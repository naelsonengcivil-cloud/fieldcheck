import { useEffect, useState } from "react";
import { db, type LocalOcorrencia } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { T, FONT_HEAD } from "@/theme";
import { ROTULO_OCORRENCIA, ehDesvio } from "@/lib/ocorrenciaService";
import { ROTULO_CRIT, corCriticidade } from "@/lib/criticidade";

// ============================================================
// Seção "Desvios e ocorrências de segurança" (Marco M) — lista itemizada
// para relatórios (obra e geral) e telas. Auto-suficiente: carrega as fotos
// de cada ocorrência (blob local → objectURL; url servidor → signed URL).
// Desvios avulsos exibem também a triagem por IA (com selo "IA · revise").
// ============================================================

export function SecaoDesvios({
  ocorrencias,
  nomeObra,
  mostrarObra = true,
}: {
  ocorrencias: LocalOcorrencia[];
  /** id da obra → nome (para o cabeçalho de cada item). */
  nomeObra: Map<string, string>;
  /** oculta a coluna de obra quando o relatório já é de uma obra só. */
  mostrarObra?: boolean;
}) {
  const [fotos, setFotos] = useState<Record<string, string[]>>({});

  useEffect(() => {
    let vivo = true;
    const criados: string[] = [];
    void (async () => {
      const acc: Record<string, string[]> = {};
      for (const o of ocorrencias) {
        const evs = await db.evidencias.where("ocorrencia_id").equals(o.id).toArray();
        const urls: string[] = [];
        for (const ev of evs) {
          if (ev.blob) {
            const u = URL.createObjectURL(ev.blob);
            criados.push(u);
            urls.push(u);
          } else if (ev.url) {
            const { data } = await supabase.storage.from("evidencias").createSignedUrl(ev.url, 3600);
            if (data?.signedUrl) urls.push(data.signedUrl);
          }
        }
        if (urls.length) acc[o.id] = urls;
      }
      if (vivo) setFotos(acc);
    })();
    return () => {
      vivo = false;
      for (const u of criados) URL.revokeObjectURL(u);
    };
  }, [ocorrencias]);

  if (ocorrencias.length === 0) return null;

  const ordenadas = [...ocorrencias].sort((a, b) =>
    (b.ocorrida_em ?? b.data).localeCompare(a.ocorrida_em ?? a.data),
  );

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 16, textTransform: "uppercase", color: T.navy, borderBottom: `2px solid ${T.line}`, paddingBottom: 6, marginBottom: 10 }}>
        Desvios e ocorrências de segurança ({ordenadas.length})
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {ordenadas.map((o) => {
          const desvio = ehDesvio(o.tipo);
          const cor = desvio && o.criticidade ? corCriticidade(o.criticidade) : null;
          return (
            <div key={o.id} style={{ border: `1px solid ${T.line}`, borderRadius: 10, padding: 12, breakInside: "avoid" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: desvio ? T.yellowDark : T.red }}>
                  {desvio ? "📸" : "⚠️"} {ROTULO_OCORRENCIA[o.tipo]}
                </span>
                {cor && o.criticidade && (
                  <span style={{ background: cor.bg, color: cor.fg, fontWeight: 700, fontSize: 11, padding: "2px 8px", borderRadius: 999 }}>
                    {ROTULO_CRIT[o.criticidade]}
                  </span>
                )}
                <span style={{ fontSize: 12, color: T.inkSoft, marginLeft: "auto" }}>
                  {new Date(o.ocorrida_em ?? o.data).toLocaleString("pt-BR")}
                </span>
              </div>
              <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 3 }}>
                {mostrarObra ? (nomeObra.get(o.obra_id) ?? "Obra") : ""}
                {o.frente ? `${mostrarObra ? " · " : ""}${o.frente}` : ""}
                {o.ref_cronograma_codigo ? ` · EAP ${o.ref_cronograma_codigo}` : ""}
              </div>
              <div style={{ fontSize: 13.5, color: T.ink, marginTop: 4, lineHeight: 1.45 }}>{o.descricao}</div>

              {o.triagem_ia && (
                <div style={{ marginTop: 6, background: "#FFF8E6", borderRadius: 8, padding: "7px 10px", fontSize: 12.5, lineHeight: 1.5 }}>
                  <span style={{ background: "#FFF4D6", color: T.yellowDark, fontWeight: 700, fontSize: 10.5, padding: "2px 7px", borderRadius: 999, marginRight: 6 }}>
                    IA · revise
                  </span>
                  {o.triagem_ia.familias_normativas.length > 0 && (
                    <span style={{ color: T.yellowDark, fontWeight: 600 }}>
                      {o.triagem_ia.familias_normativas.join(" · ")}
                    </span>
                  )}
                </div>
              )}

              {(fotos[o.id] ?? []).length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {fotos[o.id].map((u, k) => (
                    <img key={k} src={u} alt="" style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 8 }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
