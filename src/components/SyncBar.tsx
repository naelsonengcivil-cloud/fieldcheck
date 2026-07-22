import { T, FONT_HEAD } from "@/theme";
import { useSync } from "@/features/sync/SyncProvider";

// ============================================================
// Indicador de sincronização (§7 / RF06). Mostra estado (online,
// pendências, sincronizando) e botão de sync manual.
// ============================================================

export function SyncBar({ onAbrir }: { onAbrir?: () => void } = {}) {
  const { online, sincronizando, pendencias, ultimoErro, sincronizarAgora } =
    useSync();
  // A faixa vira tocável (abre o painel de pendências) quando há fila/erro.
  const tocavel = !!onAbrir && (pendencias > 0 || !!ultimoErro);

  const { texto, cor, bg } = estado();
  function estado() {
    if (!online)
      return { texto: "Offline — dados salvos no aparelho", cor: T.gray, bg: T.grayBg };
    if (sincronizando)
      return { texto: "Sincronizando…", cor: T.yellowDark, bg: "#FFF4D6" };
    if (pendencias > 0)
      return {
        texto: `${pendencias} pendente${pendencias > 1 ? "s" : ""} para enviar`,
        cor: T.yellowDark,
        bg: "#FFF4D6",
      };
    return { texto: "Tudo sincronizado", cor: T.green, bg: T.greenBg };
  }

  const podeSincronizar = online && !sincronizando && pendencias > 0;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 14px",
        background: bg,
        borderBottom: `1px solid ${T.line}`,
        fontSize: 13,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: cor,
          flexShrink: 0,
          boxShadow: sincronizando ? `0 0 0 3px ${cor}22` : "none",
        }}
      />
      <span
        onClick={tocavel ? onAbrir : undefined}
        style={{ flex: 1, color: cor, fontWeight: 600, cursor: tocavel ? "pointer" : "default", display: "flex", alignItems: "center", gap: 6 }}
      >
        {ultimoErro ? `Erro: ${ultimoErro}` : texto}
        {tocavel && <span aria-hidden style={{ color: T.inkSoft, fontWeight: 700 }}>›</span>}
      </span>
      {podeSincronizar && (
        <button
          onClick={() => void sincronizarAgora()}
          style={{
            background: T.navy,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "6px 12px",
            fontFamily: FONT_HEAD,
            fontWeight: 700,
            fontSize: 12.5,
            textTransform: "uppercase",
            letterSpacing: 0.4,
            cursor: "pointer",
          }}
        >
          Sincronizar
        </button>
      )}
    </div>
  );
}
