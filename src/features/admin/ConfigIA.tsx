import { useState } from "react";
import { Card, Header, inputStyle } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";

// ============================================================
// Config de IA da empresa (Marco K, K2) — admin.
// Liga/desliga a redação assistida por IA nas RNCs. Persiste em
// empresas.ia_habilitada via UPDATE (RLS admin-only, igual a prazos_nc).
// Desligado → a rnc-generate não chama a IA (RNC nasce em branco/interpolada).
// ============================================================

export function ConfigIA({ onBack }: { onBack: () => void }) {
  const { empresa, patchEmpresa } = useAuth();
  const [ativo, setAtivo] = useState<boolean>(empresa?.ia_habilitada !== false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ msg: string; ok: boolean } | null>(null);
  // Assistente de alertas (Marco L) — detecção sobre os eventos; independe da IA.
  const [alertasOn, setAlertasOn] = useState<boolean>(empresa?.alertas_habilitado !== false);
  const [freq, setFreq] = useState<"semanal" | "diario">(empresa?.alertas_frequencia ?? "semanal");

  function mostrar(msg: string, ok: boolean) {
    setAviso({ msg, ok });
    setTimeout(() => setAviso(null), 3500);
  }

  async function alternar(valor: boolean) {
    if (!empresa) return;
    setAtivo(valor); // otimista
    setSalvando(true);
    const { error } = await supabase.from("empresas").update({ ia_habilitada: valor }).eq("id", empresa.id);
    setSalvando(false);
    if (error) {
      setAtivo(!valor); // reverte
      return mostrar("Não foi possível salvar. Só o administrador altera esta opção.", false);
    }
    patchEmpresa({ ia_habilitada: valor }); // sincroniza o contexto sem remontar a tela
    mostrar(valor ? "Redação por IA ativada ✓" : "Redação por IA desativada ✓", true);
  }

  // Marco L — liga/desliga o assistente de alertas e a frequência do digest.
  async function salvarAlertas(patch: { alertas_habilitado?: boolean; alertas_frequencia?: "semanal" | "diario" }) {
    if (!empresa) return;
    const antes = { alertas_habilitado: alertasOn, alertas_frequencia: freq };
    if (patch.alertas_habilitado !== undefined) setAlertasOn(patch.alertas_habilitado);
    if (patch.alertas_frequencia) setFreq(patch.alertas_frequencia);
    setSalvando(true);
    const { error } = await supabase.from("empresas").update(patch).eq("id", empresa.id);
    setSalvando(false);
    if (error) {
      setAlertasOn(antes.alertas_habilitado);
      setFreq(antes.alertas_frequencia);
      return mostrar("Não foi possível salvar. Só o administrador altera esta opção.", false);
    }
    patchEmpresa(patch);
    mostrar("Alertas atualizados ✓", true);
  }

  return (
    <div>
      <Header titulo="Inteligência artificial" sub="Redação assistida nas RNCs" onBack={onBack} />
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
          Quando ativa, ao gerar uma RNC a plataforma usa IA para redigir as seções
          normativas a partir do texto-base do item. Quando desativada, a RNC é criada
          apenas com a interpolação determinística (ou em branco), sem chamar a IA.
        </div>

        <Card>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer" }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>
              Redação assistida por IA nas RNCs
            </span>
            <input
              type="checkbox"
              checked={ativo}
              disabled={salvando}
              onChange={(e) => void alternar(e.target.checked)}
              style={{ width: 20, height: 20, accentColor: T.green, cursor: "pointer", flexShrink: 0 }}
            />
          </label>
        </Card>

        {/* Marco L — assistente de alertas (detecção; independe da IA). */}
        <Card>
          <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", color: T.inkSoft, marginBottom: 10 }}>
            Assistente de alertas
          </div>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer" }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>
              Gerar alertas automáticos (NCs vencidas, reincidência, contratadas, conformidade)
            </span>
            <input
              type="checkbox"
              checked={alertasOn}
              disabled={salvando}
              onChange={(e) => void salvarAlertas({ alertas_habilitado: e.target.checked })}
              style={{ width: 20, height: 20, accentColor: T.green, cursor: "pointer", flexShrink: 0 }}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 10 }}>
            <span style={{ fontSize: 14, color: alertasOn ? T.ink : T.inkSoft }}>Frequência do resumo</span>
            <select
              value={freq}
              disabled={salvando || !alertasOn}
              onChange={(e) => void salvarAlertas({ alertas_frequencia: e.target.value as "semanal" | "diario" })}
              style={{ ...inputStyle, width: "auto", fontSize: 14, padding: "6px 8px" }}
            >
              <option value="semanal">Semanal</option>
              <option value="diario">Diário</option>
            </select>
          </label>
          <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 10, lineHeight: 1.5 }}>
            Os alertas vêm de regras determinísticas sobre os seus dados (sem IA) e aparecem em
            <strong> 🧠 Alertas</strong>, no sino e por push para gestores/admins. Todo alerta mostra os
            números e o tamanho da amostra que o originaram.
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.6 }}>
            <strong style={{ color: T.ink }}>Responsabilidade sobre o conteúdo de IA.</strong> O texto
            gerado é uma <strong>sugestão de apoio</strong>. A revisão e a validade técnica do
            conteúdo permanecem do profissional habilitado que assina o relatório e do gestor da
            conta. A indisponibilidade da IA nunca impede o registro da NC ou da RNC.
            <br />
            <span style={{ display: "inline-block", marginTop: 8, fontStyle: "italic" }}>
              ⚠️ Recomenda-se incluir uma cláusula específica sobre conteúdo assistido por IA e
              responsabilidade de revisão nos <strong>termos de uso</strong> da sua conta —
              providenciar a redação jurídica apropriada.
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}
