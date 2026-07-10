import { useState } from "react";
import { Botao, Card, Header } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import { CRITICIDADES, ROTULO_CRIT, PRAZOS_PADRAO, corCriticidade } from "@/lib/criticidade";
import type { Criticidade } from "@/types/db";

// ============================================================
// Config de prazos de tratamento de NC por criticidade (Marco I4) — admin.
// Define, em dias, o prazo sugerido ao registrar uma NC. Fica em
// empresas.prazos_nc (jsonb). A execução usa como padrão editável.
// ============================================================

export function ConfigPrazos({ onBack }: { onBack: () => void }) {
  const { empresa, recarregarPerfil } = useAuth();
  const inicial = empresa?.prazos_nc ?? PRAZOS_PADRAO;
  const [dias, setDias] = useState<Record<Criticidade, string>>({
    baixa: String(inicial.baixa ?? PRAZOS_PADRAO.baixa),
    media: String(inicial.media ?? PRAZOS_PADRAO.media),
    alta: String(inicial.alta ?? PRAZOS_PADRAO.alta),
    critica: String(inicial.critica ?? PRAZOS_PADRAO.critica),
  });
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ msg: string; ok: boolean } | null>(null);

  function mostrar(msg: string, ok: boolean) {
    setAviso({ msg, ok });
    setTimeout(() => setAviso(null), 3500);
  }

  function setDia(c: Criticidade, v: string) {
    setDias((prev) => ({ ...prev, [c]: v.replace(/\D/g, "") }));
  }

  async function salvar() {
    if (!empresa) return;
    const prazos: Record<string, number> = {};
    for (const c of CRITICIDADES) {
      const n = parseInt(dias[c], 10);
      if (!Number.isFinite(n) || n < 1) return mostrar(`Prazo de "${ROTULO_CRIT[c]}" deve ser ≥ 1 dia.`, false);
      prazos[c] = n;
    }
    setSalvando(true);
    const { error } = await supabase.from("empresas").update({ prazos_nc: prazos }).eq("id", empresa.id);
    setSalvando(false);
    if (error) return mostrar("Não foi possível salvar. Só o administrador altera prazos.", false);
    await recarregarPerfil();
    mostrar("Prazos atualizados ✓", true);
  }

  function restaurar() {
    setDias({
      baixa: String(PRAZOS_PADRAO.baixa),
      media: String(PRAZOS_PADRAO.media),
      alta: String(PRAZOS_PADRAO.alta),
      critica: String(PRAZOS_PADRAO.critica),
    });
  }

  return (
    <div>
      <Header titulo="Prazos de NC" sub="Prazo sugerido por criticidade" onBack={onBack} />
      {aviso && (
        <div
          role="status"
          style={{ padding: "10px 14px", background: aviso.ok ? T.greenBg : T.redBg, color: aviso.ok ? T.green : T.red, fontWeight: 600, fontSize: 13.5 }}
        >
          {aviso.msg}
        </div>
      )}

      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.5 }}>
          Ao registrar uma NC, o app sugere a data-limite somando estes dias à data da inspeção.
          O inspetor pode ajustar caso a caso.
        </div>

        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Da mais crítica à menos, refletindo a prioridade de tratamento. */}
            {[...CRITICIDADES].reverse().map((c) => {
              const cor = corCriticidade(c);
              return (
                <div key={c} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span
                    style={{
                      flex: 1,
                      fontWeight: 700,
                      fontSize: 15,
                      color: cor.fg,
                      background: cor.bg,
                      borderRadius: 8,
                      padding: "8px 12px",
                    }}
                  >
                    {ROTULO_CRIT[c]}
                  </span>
                  <input
                    inputMode="numeric"
                    value={dias[c]}
                    onChange={(e) => setDia(c, e.target.value)}
                    style={{
                      width: 68,
                      textAlign: "center",
                      border: `2px solid ${dias[c] && parseInt(dias[c], 10) >= 1 ? T.line : T.red}`,
                      borderRadius: 10,
                      padding: "10px 8px",
                      fontSize: 16,
                      fontWeight: 700,
                    }}
                  />
                  <span style={{ fontSize: 13.5, color: T.inkSoft, width: 40 }}>
                    {parseInt(dias[c], 10) === 1 ? "dia" : "dias"}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        <Botao onClick={() => void salvar()} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar prazos"}
        </Botao>
        <button
          onClick={restaurar}
          style={{ background: "none", border: "none", color: T.navy, fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: FONT_HEAD }}
        >
          Restaurar padrão (1 · 3 · 7 · 15)
        </button>
      </div>
    </div>
  );
}
