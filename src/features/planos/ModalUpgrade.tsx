import { Botao } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { ROTULO_PLANO } from "@/lib/planos";

// ============================================================
// Modal de upgrade (Frente 3) — vitrine: o recurso nunca some, mostra o que
// ele faz + o plano que o inclui + CTA para a página de planos.
// Usado tanto por feature bloqueada quanto por limite atingido (hint upgrade:*).
// ============================================================

export function ModalUpgrade({
  titulo,
  corpo,
  planoAlvo,
  onVerPlanos,
  onFechar,
}: {
  titulo: string;
  corpo: string;
  planoAlvo?: "basic" | "premium" | "intelligence" | null;
  onVerPlanos: () => void;
  onFechar: () => void;
}) {
  return (
    <div
      onClick={onFechar}
      style={{
        position: "fixed", inset: 0, background: "rgba(28,39,51,0.55)", zIndex: 1000,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.card, borderRadius: "18px 18px 0 0", padding: 20, width: "100%", maxWidth: 460,
          boxShadow: "0 -8px 30px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 26 }}>🔒</span>
          <span style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 18, color: T.navy }}>{titulo}</span>
        </div>
        <div style={{ fontSize: 14, color: T.ink, lineHeight: 1.55, marginBottom: 12 }}>{corpo}</div>
        {planoAlvo && (
          <div
            style={{
              display: "inline-block", background: "#FFF4D6", color: T.yellowDark, fontWeight: 700,
              fontSize: 12.5, padding: "4px 10px", borderRadius: 999, marginBottom: 14,
            }}
          >
            Disponível no plano {ROTULO_PLANO[planoAlvo] ?? planoAlvo}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Botao onClick={onVerPlanos}>Ver planos e fazer upgrade</Botao>
          <button
            onClick={onFechar}
            style={{ background: "none", border: "none", color: T.inkSoft, fontWeight: 600, fontSize: 13.5, cursor: "pointer", padding: 6 }}
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
}
