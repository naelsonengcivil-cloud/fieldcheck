import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Header } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { db, type LocalInspecao } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { dataInspecao } from "@/lib/obraView";

// ============================================================
// Detalhe da inspeção (RF07) — somente leitura. Junta respostas +
// itens (texto) + eventos (responsável/prazo) + evidências (foto local
// ou signed URL do Storage). Lê do Dexie; funciona offline.
// ============================================================

const LABEL: Record<string, string> = { C: "CONF.", NC: "NC", NA: "N/A" };
const cor = (r: string) => (r === "C" ? T.green : r === "NC" ? T.red : T.gray);

export function Detalhe({
  insp,
  onBack,
}: {
  insp: LocalInspecao;
  onBack: () => void;
}) {
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

  return (
    <div>
      <Header
        titulo={checklist?.codigo ?? "Inspeção"}
        sub={[
          checklist?.nome,
          obra?.nome,
          insp.frente || null,
          dataInspecao(insp).split("-").reverse().join("/"),
        ]
          .filter(Boolean)
          .join(" · ")}
        onBack={onBack}
      />
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
                    <br />
                    {evento?.responsavel && `👤 ${evento.responsavel}`}
                    {evento?.prazo &&
                      ` · 📅 ${evento.prazo.split("-").reverse().join("/")}`}
                  </div>
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
      </div>
    </div>
  );
}
