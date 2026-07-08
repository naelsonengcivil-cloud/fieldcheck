import { useCallback, useEffect, useState } from "react";
import { Botao, Card, Header, Kpi, inputStyle } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";

// ============================================================
// Painel do operador da plataforma (Marco F · super_admin — Alpha). Lista
// empresas com plano/cortesia/uso (só metadados/agregados, via RPC) e
// concede cortesia. NUNCA acessa dados operacionais das empresas.
// ============================================================

interface EmpresaMeta {
  id: string;
  nome: string;
  plano: string;
  trial_expira_em: string | null;
  cortesia_ate: string | null;
  assinatura_ativa_ate: string | null;
  tem_assinatura: boolean;
  n_usuarios: number;
  n_inspecoes: number;
  ultima_atividade: string | null;
}

const fmtData = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");
const futuro = (iso: string | null) => !!iso && new Date(iso).getTime() > Date.now();

function liberada(e: EmpresaMeta): boolean {
  return (
    (e.plano === "ativo" && e.tem_assinatura) ||
    futuro(e.assinatura_ativa_ate) ||
    (e.plano === "trial" && futuro(e.trial_expira_em)) ||
    futuro(e.cortesia_ate)
  );
}

export function TelaOperador() {
  const { signOut } = useAuth();
  const [empresas, setEmpresas] = useState<EmpresaMeta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<{ msg: string; ok: boolean } | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [ate, setAte] = useState("");
  const [motivo, setMotivo] = useState("");

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc("plataforma_empresas");
    if (!error) setEmpresas((data as EmpresaMeta[]) ?? []);
    setCarregando(false);
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  function mostrar(msg: string, ok: boolean) { setAviso({ msg, ok }); setTimeout(() => setAviso(null), 3500); }

  async function conceder(id: string) {
    if (!ate) return mostrar("Informe a data da cortesia.", false);
    const { error } = await supabase.rpc("conceder_cortesia", { p_empresa_id: id, p_ate: new Date(ate).toISOString(), p_motivo: motivo });
    if (error) return mostrar("Não foi possível conceder a cortesia.", false);
    mostrar("Cortesia concedida.", true);
    setAberto(null); setAte(""); setMotivo("");
    void carregar();
  }

  const totalInsp = empresas.reduce((s, e) => s + Number(e.n_inspecoes || 0), 0);

  return (
    <div style={{ background: T.bg, minHeight: "100vh", maxWidth: 620, margin: "0 auto", color: T.ink }}>
      <Header
        titulo="Operador · FieldCheck"
        sub="Painel da plataforma (Alpha)"
        right={
          <button onClick={() => void signOut()} style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", padding: "8px 12px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT_HEAD, textTransform: "uppercase", letterSpacing: 0.4 }}>Sair</button>
        }
      />
      {aviso && <div role="status" style={{ padding: "10px 14px", background: aviso.ok ? T.greenBg : T.redBg, color: aviso.ok ? T.green : T.red, fontWeight: 600, fontSize: 13.5 }}>{aviso.msg}</div>}
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Kpi label="Empresas" valor={empresas.length} cor={T.navy} />
          <Kpi label="Liberadas" valor={empresas.filter(liberada).length} cor={T.green} />
          <Kpi label="Inspeções" valor={totalInsp} cor={T.navy} />
        </div>
        <div style={{ fontSize: 12, color: T.inkSoft }}>
          🔒 Privacidade: este painel mostra apenas metadados de conta e uso agregado — nenhum dado operacional (inspeções, fotos) das empresas.
        </div>

        {carregando && <div style={{ color: T.inkSoft, padding: 8 }}>Carregando…</div>}
        {empresas.map((e) => {
          const lib = liberada(e);
          return (
            <Card key={e.id} style={{ borderLeft: `5px solid ${lib ? T.green : T.red}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15.5 }}>{e.nome}</div>
                  <div style={{ fontSize: 12.5, color: T.inkSoft }}>
                    {e.plano}{e.tem_assinatura ? " · assinatura" : ""}
                    {e.cortesia_ate ? ` · cortesia até ${fmtData(e.cortesia_ate)}` : ""}
                    {e.plano === "trial" ? ` · trial até ${fmtData(e.trial_expira_em)}` : ""}
                  </div>
                  <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 2 }}>
                    {e.n_usuarios} usuário(s) · {e.n_inspecoes} inspeção(ões) · últ. atividade {fmtData(e.ultima_atividade)}
                  </div>
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", color: lib ? T.green : T.red, border: `1px solid ${lib ? T.green : T.red}`, borderRadius: 6, padding: "2px 6px" }}>
                  {lib ? "liberada" : "bloqueada"}
                </span>
              </div>
              {aberto === e.id ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <input type="date" value={ate} onChange={(ev) => setAte(ev.target.value)} style={inputStyle} aria-label="Cortesia até" />
                    <input value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder="Motivo" style={inputStyle} />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Botao onClick={() => void conceder(e.id)} style={{ fontSize: 14 }}>Conceder cortesia</Botao>
                    <Botao variante="fantasma" onClick={() => { setAberto(null); setAte(""); setMotivo(""); }} style={{ fontSize: 14 }}>Cancelar</Botao>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setAberto(e.id); setAte(""); setMotivo(""); }} style={{ marginTop: 10, background: "none", border: `1px solid ${T.yellowDark}`, color: T.yellowDark, fontWeight: 700, fontSize: 12.5, cursor: "pointer", borderRadius: 8, padding: "6px 10px" }}>
                  🎁 Conceder / alterar cortesia
                </button>
              )}
            </Card>
          );
        })}
        {!carregando && empresas.length === 0 && <div style={{ textAlign: "center", color: T.inkSoft, padding: 16 }}>Nenhuma empresa.</div>}
      </div>
    </div>
  );
}
