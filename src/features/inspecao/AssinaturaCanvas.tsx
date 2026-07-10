import { useEffect, useRef } from "react";
import { T, FONT_HEAD } from "@/theme";

// ============================================================
// Captura de assinatura (Marco J) — canvas de desenho a dedo/mouse.
// Exporta PNG (data URL) via onChange sempre que o traço muda; funciona
// offline (nada sobe aqui — a assinatura viaja com a inspeção no sync).
// ============================================================

export function AssinaturaCanvas({
  onChange,
  temAssinatura,
  onLimpar,
}: {
  /** PNG data URL do traço atual, ou null quando vazio. */
  onChange: (dataUrl: string | null) => void;
  temAssinatura: boolean;
  onLimpar: () => void;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const desenhando = useRef(false);
  const vazio = useRef(true);
  const ultimo = useRef<{ x: number; y: number } | null>(null);

  // Ajusta a resolução interna ao tamanho renderizado (nitidez em telas retina).
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = cv.getBoundingClientRect();
    cv.width = Math.round(rect.width * dpr);
    cv.height = Math.round(rect.height * dpr);
    const ctx = cv.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#16181B";
  }, []);

  function ponto(e: PointerEvent | React.PointerEvent): { x: number; y: number } {
    const cv = ref.current!;
    const rect = cv.getBoundingClientRect();
    return { x: (e as PointerEvent).clientX - rect.left, y: (e as PointerEvent).clientY - rect.top };
  }

  function inicio(e: React.PointerEvent) {
    e.preventDefault();
    desenhando.current = true;
    ultimo.current = ponto(e);
    ref.current?.setPointerCapture(e.pointerId);
  }

  function mover(e: React.PointerEvent) {
    if (!desenhando.current) return;
    const ctx = ref.current!.getContext("2d")!;
    const p = ponto(e);
    const u = ultimo.current!;
    ctx.beginPath();
    ctx.moveTo(u.x, u.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ultimo.current = p;
    vazio.current = false;
  }

  function fim() {
    if (!desenhando.current) return;
    desenhando.current = false;
    ultimo.current = null;
    if (!vazio.current) onChange(ref.current!.toDataURL("image/png"));
  }

  function limpar() {
    const cv = ref.current;
    if (!cv) return;
    cv.getContext("2d")!.clearRect(0, 0, cv.width, cv.height);
    vazio.current = true;
    onChange(null);
    onLimpar();
  }

  return (
    <div>
      <div
        style={{
          position: "relative",
          border: `2px solid ${temAssinatura ? T.line : T.yellowDark}`,
          borderRadius: 12,
          background: "#fff",
          height: 160,
          touchAction: "none",
          overflow: "hidden",
        }}
      >
        <canvas
          ref={ref}
          onPointerDown={inicio}
          onPointerMove={mover}
          onPointerUp={fim}
          onPointerLeave={fim}
          style={{ width: "100%", height: "100%", display: "block", cursor: "crosshair" }}
        />
        {!temAssinatura && (
          <span
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: T.inkSoft,
              fontSize: 14,
              pointerEvents: "none",
            }}
          >
            Assine aqui com o dedo
          </span>
        )}
      </div>
      <button
        onClick={limpar}
        style={{
          marginTop: 6,
          background: "none",
          border: "none",
          color: T.navy,
          fontWeight: 700,
          fontSize: 13,
          cursor: "pointer",
          fontFamily: FONT_HEAD,
        }}
      >
        Limpar assinatura
      </button>
    </div>
  );
}
