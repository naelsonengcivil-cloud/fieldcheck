import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { T } from "@/theme";

// ============================================================
// Sino de notificações (N1) — vai no slot direito do cabeçalho.
// Mostra o contador de não lidas (do cache Dexie, já filtrado por RLS).
// ============================================================

export function SinoNotificacoes({ onAbrir }: { onAbrir: () => void }) {
  const naoLidas = useLiveQuery(
    () => db.notificacoes.filter((n) => !n.lida_em).count(),
    [],
    0,
  );

  return (
    <button
      onClick={onAbrir}
      aria-label={`Notificações${naoLidas ? ` (${naoLidas} não lidas)` : ""}`}
      style={{
        position: "relative",
        background: "rgba(255,255,255,0.12)",
        border: "none",
        color: "#fff",
        width: 40,
        height: 40,
        borderRadius: 10,
        fontSize: 18,
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      🔔
      {naoLidas > 0 && (
        <span
          style={{
            position: "absolute",
            top: -4,
            right: -4,
            minWidth: 18,
            height: 18,
            padding: "0 4px",
            borderRadius: 999,
            background: T.red,
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxSizing: "border-box",
          }}
        >
          {naoLidas > 9 ? "9+" : naoLidas}
        </span>
      )}
    </button>
  );
}
