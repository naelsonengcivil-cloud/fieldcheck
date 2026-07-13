import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Card, Header } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { db } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { ROTULO_CRIT } from "@/lib/criticidade";
import type { Criticidade } from "@/types/db";

// ============================================================
// Banco de experiência (melhoria 6, MVP) — relatório gerencial com frequências
// históricas do próprio banco. Consome as FUNÇÕES SQL nomeadas (0033), não
// recalcula na tela (diretriz de dados/IA). Apresentação honesta: taxas são
// frequências observadas (não previsões), com o tamanho da amostra visível.
// Lê do servidor (agregação sobre o histórico) — requer conexão.
// ============================================================

interface ItemNc {
  checklist_codigo: string;
  item_numero: number;
  item_texto: string;
  modulo: string | null;
  ncs: number;
  inspecoes: number;
  taxa: number;
}
interface TempoTrat {
  criticidade: string;
  n: number;
  tempo_medio_dias: number;
}

export function TelaBancoExperiencia({ onVoltar }: { onVoltar: () => void }) {
  const obras = useLiveQuery(() => db.obras.toArray(), [], []);
  const [obraId, setObraId] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [itens, setItens] = useState<ItemNc[]>([]);
  const [tempos, setTempos] = useState<TempoTrat[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      setCarregando(true);
      setErro(null);
      const params = { p_obra: obraId || null, p_de: de || null, p_ate: ate || null };
      const [r1, r2] = await Promise.all([
        supabase.rpc("experiencia_itens_nc", params),
        supabase.rpc("experiencia_tempo_tratamento", params),
      ]);
      if (!vivo) return;
      if (r1.error || r2.error) setErro("Não foi possível carregar (requer conexão).");
      setItens((r1.data as ItemNc[]) ?? []);
      setTempos((r2.data as TempoTrat[]) ?? []);
      setCarregando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [obraId, de, ate]);

  const reincidentes = useMemo(() => itens.filter((i) => i.ncs >= 2), [itens]);
  const amostra = useMemo(() => itens.reduce((s, i) => s + i.inspecoes, 0), [itens]);

  return (
    <div>
      <Header titulo="Banco de experiência" sub="Frequências históricas da empresa" onBack={onVoltar} />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select value={obraId} onChange={(e) => setObraId(e.target.value)} style={campo}>
            <option value="">Todas as obras</option>
            {obras.map((o) => (
              <option key={o.id} value={o.id}>{o.nome}</option>
            ))}
          </select>
          <label style={rotulo}>
            De <input type="date" value={de} onChange={(e) => setDe(e.target.value)} style={campoData} />
          </label>
          <label style={rotulo}>
            Até <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} style={campoData} />
          </label>
        </div>

        <div style={{ fontSize: 12, color: T.inkSoft, fontStyle: "italic", lineHeight: 1.5 }}>
          Números do histórico registrado. As taxas são <b>frequências observadas</b> — não previsões —
          e mostram o tamanho da amostra. Recorte atual: <b>{amostra}</b> ponto(s) inspecionado(s).
        </div>

        {erro && (
          <div style={{ background: T.redBg, color: T.red, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontWeight: 600 }}>
            {erro}
          </div>
        )}
        {carregando && <div style={{ color: T.inkSoft, fontSize: 13 }}>Carregando…</div>}

        <Card>
          <Titulo>Itens com maior taxa de NC</Titulo>
          {itens.length === 0 ? (
            <Vazio />
          ) : (
            <Tabela cols={["Item", "Taxa", "NCs", "Amostra"]}>
              {itens.slice(0, 25).map((i) => (
                <tr key={i.checklist_codigo + "·" + i.item_numero}>
                  <td style={td}>
                    <b>{i.checklist_codigo}·{i.item_numero}</b> {i.item_texto}
                  </td>
                  <td style={tdC}>
                    <b style={{ color: i.taxa >= 50 ? T.red : i.taxa >= 20 ? T.yellowDark : T.ink }}>{i.taxa}%</b>
                  </td>
                  <td style={tdC}>{i.ncs}</td>
                  <td style={tdC}>{i.inspecoes}</td>
                </tr>
              ))}
            </Tabela>
          )}
          <Nota>Taxa = NCs ÷ vezes que o item foi inspecionado (amostra). Ordenado por taxa.</Nota>
        </Card>

        <Card>
          <Titulo>Reincidência (itens com ≥ 2 NCs)</Titulo>
          {reincidentes.length === 0 ? (
            <Vazio texto="Nenhum item reincidente no recorte." />
          ) : (
            <Tabela cols={["Item", "NCs", "Amostra"]}>
              {reincidentes.slice(0, 25).map((i) => (
                <tr key={i.checklist_codigo + "·" + i.item_numero}>
                  <td style={td}>
                    <b>{i.checklist_codigo}·{i.item_numero}</b> {i.item_texto}
                  </td>
                  <td style={tdC}>
                    <b style={{ color: T.red }}>{i.ncs}</b>
                  </td>
                  <td style={tdC}>{i.inspecoes}</td>
                </tr>
              ))}
            </Tabela>
          )}
        </Card>

        <Card>
          <Titulo>Tempo médio de tratamento por criticidade</Titulo>
          {tempos.length === 0 ? (
            <Vazio texto="Nenhuma NC fechada no recorte." />
          ) : (
            <Tabela cols={["Criticidade", "NCs fechadas", "Tempo médio"]}>
              {tempos.map((t) => (
                <tr key={t.criticidade}>
                  <td style={td}>{ROTULO_CRIT[t.criticidade as Criticidade] ?? t.criticidade}</td>
                  <td style={tdC}>{t.n}</td>
                  <td style={tdC}>{t.tempo_medio_dias} d</td>
                </tr>
              ))}
            </Tabela>
          )}
        </Card>

        <div style={{ fontSize: 11.5, color: T.inkSoft, textAlign: "center", lineHeight: 1.5 }}>
          Fundação de dados reutilizável (funções SQL nomeadas) — base do módulo de análise preditiva por IA.
        </div>
      </div>
    </div>
  );
}

function Titulo({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", color: T.inkSoft, marginBottom: 8 }}>
      {children}
    </div>
  );
}
function Vazio({ texto = "Sem dados no recorte." }: { texto?: string }) {
  return <div style={{ color: T.inkSoft, fontSize: 13, fontStyle: "italic" }}>{texto}</div>;
}
function Nota({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 6 }}>{children}</div>;
}
function Tabela({ cols, children }: { cols: string[]; children: ReactNode }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th key={c} style={{ ...th, textAlign: i === 0 ? "left" : "center" }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const campo: CSSProperties = { border: `2px solid ${T.line}`, borderRadius: 10, padding: "8px 8px", fontSize: 14, background: "#fff" };
const campoData: CSSProperties = { border: `2px solid ${T.line}`, borderRadius: 8, padding: "6px 6px", fontSize: 13, background: "#fff" };
const rotulo: CSSProperties = { fontSize: 12.5, color: T.inkSoft, display: "flex", alignItems: "center", gap: 6 };
const th: CSSProperties = { borderBottom: `2px solid ${T.line}`, padding: "5px 6px", fontSize: 11.5, color: T.inkSoft, textTransform: "uppercase" };
const td: CSSProperties = { borderBottom: `1px solid ${T.line}`, padding: "6px", verticalAlign: "top" };
const tdC: CSSProperties = { ...td, textAlign: "center", whiteSpace: "nowrap" };
