import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Card, Header, inputStyle } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { db } from "@/lib/db";
import { calcularBird } from "@/lib/piramideBird";
import { PiramideBird } from "@/features/seguranca/PiramideBird";

// ============================================================
// Pirâmide de Bird consolidada da empresa (Marco A2). Agrega todas as
// classificações de NC de ST + ocorrências (RLS por empresa), com filtro
// de período. Lê do Dexie.
// ============================================================

export function TelaSeguranca({ onBack }: { onBack: () => void }) {
  const respostas = useLiveQuery(() => db.respostas.toArray(), [], []);
  const ocorrencias = useLiveQuery(() => db.ocorrencias.toArray(), [], []);

  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  const kpis = useMemo(() => {
    const respClass = respostas.filter((r) => {
      if (!r.classificacao_st) return false;
      const d = r.criado_em.slice(0, 10);
      if (de && d < de) return false;
      if (ate && d > ate) return false;
      return true;
    });
    const ocor = ocorrencias.filter((o) => {
      if (de && o.data < de) return false;
      if (ate && o.data > ate) return false;
      return true;
    });
    return calcularBird(respClass, ocor);
  }, [respostas, ocorrencias, de, ate]);

  return (
    <div>
      <Header titulo="Segurança — Pirâmide de Bird" sub="Consolidado da empresa" onBack={onBack} />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <Card>
          <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 14, textTransform: "uppercase", color: T.inkSoft, marginBottom: 8 }}>
            Período
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} style={inputStyle} aria-label="Data inicial" />
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} style={inputStyle} aria-label="Data final" />
          </div>
        </Card>

        <Card>
          <PiramideBird kpis={kpis} />
        </Card>
      </div>
    </div>
  );
}
