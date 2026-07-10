import { useRef, useState } from "react";
import { Botao, Card, Header } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { useAuth } from "@/features/auth/AuthProvider";
import { subirLogo, removerLogo } from "@/lib/logo";

// ============================================================
// Identidade visual (Marco J) — admin sobe o logo da empresa, que passa a
// figurar no cabeçalho dos relatórios. Bucket público 'logos'; otimização
// e validação (≤2 MB, PNG/JPG/WEBP/SVG) na lib.
// ============================================================

export function IdentidadeVisual({ onBack }: { onBack: () => void }) {
  const { empresa, recarregarPerfil } = useAuth();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [processando, setProcessando] = useState(false);
  const [aviso, setAviso] = useState<{ msg: string; ok: boolean } | null>(null);

  function mostrar(msg: string, ok: boolean) {
    setAviso({ msg, ok });
    setTimeout(() => setAviso(null), 3800);
  }

  async function escolher(file: File | undefined) {
    if (!file || !empresa) return;
    setProcessando(true);
    try {
      await subirLogo(empresa.id, file);
      await recarregarPerfil();
      mostrar("Logo atualizado ✓", true);
    } catch (e) {
      mostrar((e as Error)?.message ?? "Falha ao enviar o logo.", false);
    } finally {
      setProcessando(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remover() {
    if (!empresa) return;
    setProcessando(true);
    try {
      await removerLogo(empresa.id);
      await recarregarPerfil();
      mostrar("Logo removido.", true);
    } catch (e) {
      mostrar((e as Error)?.message ?? "Falha ao remover o logo.", false);
    } finally {
      setProcessando(false);
    }
  }

  const logo = empresa?.logo_url ?? null;

  return (
    <div>
      <Header titulo="Identidade visual" sub="Logo da empresa nos relatórios" onBack={onBack} />
      {aviso && (
        <div
          role="status"
          style={{ padding: "10px 14px", background: aviso.ok ? T.greenBg : T.redBg, color: aviso.ok ? T.green : T.red, fontWeight: 600, fontSize: 13.5 }}
        >
          {aviso.msg}
        </div>
      )}

      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <Card>
          <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", color: T.inkSoft, marginBottom: 12 }}>
            Logo
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 120,
              border: `2px dashed ${T.line}`,
              borderRadius: 12,
              background: "#fff",
              padding: 14,
            }}
          >
            {logo ? (
              <img src={logo} alt="Logo da empresa" style={{ maxWidth: "100%", maxHeight: 140, objectFit: "contain" }} />
            ) : (
              <span style={{ color: T.inkSoft, fontSize: 13.5 }}>Nenhum logo — os relatórios usam só o nome da empresa.</span>
            )}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            style={{ display: "none" }}
            onChange={(e) => void escolher(e.target.files?.[0])}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            <Botao disabled={processando} onClick={() => fileRef.current?.click()}>
              {processando ? "Enviando…" : logo ? "Substituir logo" : "Enviar logo"}
            </Botao>
            {logo && (
              <Botao variante="fantasma" disabled={processando} style={{ color: T.red, borderColor: T.red }} onClick={() => void remover()}>
                Remover logo
              </Botao>
            )}
          </div>

          <div style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.5, marginTop: 10 }}>
            PNG, JPG, WEBP ou SVG · até 2 MB. Imagens grandes são reduzidas
            automaticamente. O logo aparece no cabeçalho dos relatórios (PDF).
          </div>
        </Card>
      </div>
    </div>
  );
}
