import type { CSSProperties, ReactNode } from "react";
import { T, FONT_HEAD } from "@/theme";

// ============================================================
// Componentes base do design system (portados do protótipo).
// ============================================================

/** Faixa zebrada amarela/preta — assinatura visual de sinalização de obra. */
export function Stripe() {
  return (
    <div
      style={{
        height: 8,
        background: `repeating-linear-gradient(-45deg, ${T.yellow} 0 14px, ${T.ink} 14px 28px)`,
      }}
    />
  );
}

export function Header({
  titulo,
  sub,
  onBack,
  right,
}: {
  titulo: string;
  sub?: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <div style={{ background: T.navy, color: "#fff" }} className="no-print">
      <Stripe />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 16px",
        }}
      >
        {onBack && (
          <button
            onClick={onBack}
            aria-label="Voltar"
            style={{
              background: "rgba(255,255,255,0.12)",
              border: "none",
              color: "#fff",
              width: 40,
              height: 40,
              borderRadius: 10,
              fontSize: 20,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            ←
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="fc-head-title"
            style={{
              fontFamily: FONT_HEAD,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: 0.3,
              textTransform: "uppercase",
            }}
          >
            {titulo}
          </div>
          {sub && (
            <div style={{ fontSize: 12.5, opacity: 0.75, marginTop: 2 }}>
              {sub}
            </div>
          )}
        </div>
        {right}
      </div>
    </div>
  );
}

type BotaoVariante = "primario" | "fantasma" | "escuro";

export function Botao({
  children,
  onClick,
  variante = "primario",
  style = {},
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variante?: BotaoVariante;
  style?: CSSProperties;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const base: Record<BotaoVariante, CSSProperties> = {
    primario: { background: T.yellow, color: T.ink, border: "none" },
    fantasma: { background: "#fff", color: T.ink, border: `2px solid ${T.line}` },
    escuro: { background: T.navy, color: "#fff", border: "none" },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      // fonte/padding vêm da classe .fc-btn (escala menor no desktop).
      className="fc-btn"
      style={{
        ...base[variante],
        opacity: disabled ? 0.45 : 1,
        fontFamily: FONT_HEAD,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        fontWeight: 700,
        borderRadius: 12,
        cursor: disabled ? "default" : "pointer",
        width: "100%",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  style = {},
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: T.card,
        border: `1px solid ${T.line}`,
        borderRadius: 14,
        padding: 14,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Kpi({
  label,
  valor,
  cor,
}: {
  label: string;
  valor: ReactNode;
  cor: string;
}) {
  return (
    <div
      style={{
        background: T.card,
        border: `1px solid ${T.line}`,
        borderRadius: 14,
        padding: "13px 6px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: FONT_HEAD,
          fontSize: 27,
          fontWeight: 700,
          color: cor,
        }}
      >
        {valor}
      </div>
      <div
        style={{
          fontSize: 11,
          color: T.inkSoft,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </div>
    </div>
  );
}

/** Estilo base para inputs/selects (borda espessa p/ toque). */
export const inputStyle: CSSProperties = {
  border: `2px solid ${T.line}`,
  borderRadius: 10,
  padding: "10px 8px",
  fontSize: 14,
  background: "#fff",
  width: "100%",
  boxSizing: "border-box",
};

/**
 * Frame de tela responsivo (v1.0): 100% no mobile; no desktop vira coluna
 * centralizada. Padrão = estreito (formulários/telas comuns); `wide` para
 * listas/painéis que ganham grade. Envolve o conteúdo da tela (Header + corpo).
 */
export function Container({
  children,
  wide = false,
  style = {},
}: {
  children: ReactNode;
  wide?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div className={wide ? "fc-screen fc-screen--wide" : "fc-screen"} style={style}>
      {children}
    </div>
  );
}
