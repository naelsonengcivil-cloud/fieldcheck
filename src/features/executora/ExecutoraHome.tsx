import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Botao, Header, Kpi } from "@/components/ui";
import { SyncBar } from "@/components/SyncBar";
import { SinoNotificacoes } from "@/features/notificacoes/SinoNotificacoes";
import { T, FONT_HEAD } from "@/theme";
import { db, type LocalInspecao } from "@/lib/db";
import { useAuth } from "@/features/auth/AuthProvider";
import { corStatus, ncAberta, ROTULO_STATUS } from "@/lib/ncEstado";
import type { StatusEvento } from "@/types/db";

// ============================================================
// Home da executora (Marco B2 / M17): worklist das NCs da sua contratada
// (o RLS já entrega só as dela) agrupadas por situação, com link para o
// detalhe da inspeção onde ela registra o tratamento. Lê do Dexie.
// ============================================================

type Bucket = "atuar" | "aguardando" | "encerradas";
const bucketDoStatus = (s: StatusEvento): Bucket =>
  s === "tratada" ? "aguardando" : ncAberta(s) ? "atuar" : "encerradas";

export function ExecutoraHome({
  onVerInspecao,
  onAbrirNotificacoes,
  onAbrirPerfil,
  onAbrirSync,
}: {
  onVerInspecao: (insp: LocalInspecao) => void;
  onAbrirNotificacoes?: () => void;
  onAbrirPerfil?: () => void;
  onAbrirSync?: () => void;
}) {
  const { empresa, perfil, signOut } = useAuth();
  const eventos = useLiveQuery(() => db.eventos.toArray(), [], []);
  const respostas = useLiveQuery(() => db.respostas.toArray(), [], []);
  const itens = useLiveQuery(() => db.itens.toArray(), [], []);
  const inspecoes = useLiveQuery(() => db.inspecoes.toArray(), [], []);
  const obras = useLiveQuery(() => db.obras.toArray(), [], []);

  const [bucket, setBucket] = useState<Bucket>("atuar");

  const respMap = useMemo(() => new Map(respostas.map((r) => [r.id, r])), [respostas]);
  const itemMap = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens]);
  const inspMap = useMemo(() => new Map(inspecoes.map((i) => [i.id, i])), [inspecoes]);
  const obraMap = useMemo(() => new Map(obras.map((o) => [o.id, o.nome])), [obras]);

  const linhas = useMemo(() => {
    return eventos
      .map((ev) => {
        const resp = respMap.get(ev.resposta_id);
        const insp = resp ? inspMap.get(resp.inspecao_id) : undefined;
        return { ev, resp, insp };
      })
      .filter((l): l is { ev: (typeof eventos)[number]; resp: NonNullable<typeof l.resp>; insp: LocalInspecao } =>
        Boolean(l.resp && l.insp && !l.insp!.arquivada),
      )
      .sort((a, b) => (b.insp.finalizada_em ?? "").localeCompare(a.insp.finalizada_em ?? ""));
  }, [eventos, respMap, inspMap]);

  const cont = useMemo(() => {
    const c = { atuar: 0, aguardando: 0, encerradas: 0 };
    for (const l of linhas) c[bucketDoStatus(l.ev.status)]++;
    return c;
  }, [linhas]);

  const visiveis = useMemo(
    () => linhas.filter((l) => bucketDoStatus(l.ev.status) === bucket),
    [linhas, bucket],
  );

  const tabs: [Bucket, string, number][] = [
    ["atuar", "Tratar", cont.atuar],
    ["aguardando", "Em análise", cont.aguardando],
    ["encerradas", "Encerradas", cont.encerradas],
  ];

  return (
    <div style={{ background: T.bg, minHeight: "100vh", maxWidth: 520, margin: "0 auto", color: T.ink }}>
      <Header
        titulo="Minhas NCs"
        sub={empresa ? empresa.nome : "Executora"}
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {onAbrirNotificacoes && <SinoNotificacoes onAbrir={onAbrirNotificacoes} />}
            <button
              onClick={() => void signOut()}
              style={{
                background: "rgba(255,255,255,0.12)", border: "none", color: "#fff",
                padding: "8px 12px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer",
                fontFamily: FONT_HEAD, textTransform: "uppercase", letterSpacing: 0.4,
              }}
            >
              Sair
            </button>
          </div>
        }
      />
      <SyncBar onAbrir={onAbrirSync} />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 13, color: T.inkSoft }}>
          Olá, {perfil?.nome}. Estas são as não conformidades atribuídas à sua contratada.
        </div>
        {onAbrirPerfil && (
          <Botao variante="fantasma" onClick={onAbrirPerfil} style={{ fontSize: 14, padding: "10px 12px" }}>
            👤 Minha conta
          </Botao>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Kpi label="A tratar" valor={cont.atuar} cor={cont.atuar ? T.red : T.green} />
          <Kpi label="Em análise" valor={cont.aguardando} cor={cont.aguardando ? T.yellowDark : T.inkSoft} />
          <Kpi label="Encerradas" valor={cont.encerradas} cor={T.green} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          {tabs.map(([b, label, n]) => (
            <button
              key={b}
              onClick={() => setBucket(b)}
              style={{
                padding: "9px 2px", borderRadius: 10, cursor: "pointer",
                fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: 0.3,
                border: bucket === b ? `2px solid ${T.yellow}` : `2px solid ${T.line}`,
                background: bucket === b ? "#FFF4D6" : "#fff",
                color: bucket === b ? T.yellowDark : T.inkSoft,
              }}
            >
              {label} ({n})
            </button>
          ))}
        </div>

        {visiveis.map(({ ev, resp, insp }) => {
          const cor = corStatus(ev.status);
          const item = itemMap.get(resp.item_id);
          return (
            <button
              key={ev.id}
              onClick={() => onVerInspecao(insp)}
              style={{
                textAlign: "left", background: T.card, border: `1px solid ${T.line}`,
                borderLeft: `5px solid ${cor.fg}`, borderRadius: 12, padding: 12, cursor: "pointer",
                width: "100%", display: "flex", gap: 10, alignItems: "flex-start",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: T.inkSoft }}>{obraMap.get(insp.obra_id) ?? "Obra"}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, marginTop: 2 }}>
                  {item?.texto ?? resp.observacao ?? "NC"}
                </div>
                <div style={{ marginTop: 4 }}>
                  <span
                    style={{
                      fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 11.5, textTransform: "uppercase",
                      letterSpacing: 0.4, color: cor.fg, background: cor.bg, padding: "2px 8px", borderRadius: 999,
                    }}
                  >
                    {ROTULO_STATUS[ev.status]}
                  </span>
                </div>
              </div>
              <span style={{ color: T.inkSoft, fontSize: 18 }}>›</span>
            </button>
          );
        })}

        {visiveis.length === 0 && (
          <div style={{ textAlign: "center", color: T.inkSoft, padding: 24, fontSize: 14 }}>
            {linhas.length === 0
              ? "Nenhuma NC atribuída à sua contratada ainda."
              : bucket === "atuar"
                ? "Nenhuma NC aguardando o seu tratamento. 👍"
                : "Nada neste filtro."}
          </div>
        )}
      </div>
    </div>
  );
}
