import { useLiveQuery } from "dexie-react-hooks";
import { Header } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { db } from "@/lib/db";
import { marcarLida, marcarTodasLidas } from "@/lib/notificacoes";
import { iconeTipo } from "@/lib/notificacoesView";
import type { Notificacao } from "@/types/db";

// ============================================================
// Lista de notificações (N1). Toque numa NC marca como lida e abre o
// detalhe da inspeção. "Marcar todas" limpa o não lido. Lê do Dexie.
// ============================================================

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function TelaNotificacoes({
  onBack,
  onVerNc,
}: {
  onBack: () => void;
  onVerNc: (eventoId: string) => void;
}) {
  const notificacoes = useLiveQuery(
    () => db.notificacoes.orderBy("criado_em").reverse().toArray(),
    [],
    [],
  );
  const naoLidas = notificacoes.filter((n) => !n.lida_em).length;

  async function abrir(n: Notificacao) {
    if (!n.lida_em) await marcarLida(n.id);
    if (n.evento_id) onVerNc(n.evento_id);
  }

  return (
    <div>
      <Header
        titulo="Notificações"
        sub={naoLidas ? `${naoLidas} não lida(s)` : "Tudo em dia"}
        onBack={onBack}
        right={
          naoLidas > 0 ? (
            <button
              onClick={() => void marcarTodasLidas()}
              style={{
                background: "rgba(255,255,255,0.12)", border: "none", color: "#fff",
                padding: "8px 12px", borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                fontFamily: FONT_HEAD, textTransform: "uppercase", letterSpacing: 0.4,
              }}
            >
              Marcar todas
            </button>
          ) : undefined
        }
      />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        {notificacoes.map((n) => {
          const lida = !!n.lida_em;
          return (
            <button
              key={n.id}
              onClick={() => void abrir(n)}
              style={{
                textAlign: "left", width: "100%", cursor: "pointer",
                background: lida ? T.card : "#FFFDF4",
                border: `1px solid ${lida ? T.line : T.yellow}`,
                borderRadius: 12, padding: 12, display: "flex", gap: 10, alignItems: "flex-start",
              }}
            >
              <span style={{ fontSize: 20, flexShrink: 0 }}>{iconeTipo(n.tipo)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 14.5, color: T.ink }}>{n.titulo}</span>
                  {!lida && <span style={{ width: 8, height: 8, borderRadius: 999, background: T.red, flexShrink: 0 }} />}
                </div>
                {n.corpo && <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>{n.corpo}</div>}
                <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 4 }}>{fmt(n.criado_em)}</div>
              </div>
              {n.evento_id && <span style={{ color: T.inkSoft, fontSize: 18 }}>›</span>}
            </button>
          );
        })}
        {notificacoes.length === 0 && (
          <div style={{ textAlign: "center", color: T.inkSoft, padding: 30, fontSize: 14 }}>
            Sem notificações por aqui.
          </div>
        )}
      </div>
    </div>
  );
}
