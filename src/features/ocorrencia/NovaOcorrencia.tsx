import { useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Botao, Card, Header, inputStyle } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { db } from "@/lib/db";
import { processarFoto } from "@/lib/foto";
import { ROTULO_OCORRENCIA, type DadosOcorrencia } from "@/lib/ocorrenciaService";
import { aceitaNovaInspecao } from "@/lib/obraStatus";
import type { TipoOcorrencia } from "@/types/db";

// ============================================================
// Registro de ocorrência (dano/acidente) — Marco A2. Formulário leve,
// grava offline (Dexie) e alimenta os níveis superiores da Pirâmide de
// Bird. Obra + tipo + data + descrição obrigatórios; contratada e fotos
// opcionais.
// ============================================================

const TIPOS: TipoOcorrencia[] = [
  "dano_material",
  "acidente_sem_afastamento",
  "acidente_com_afastamento",
];

const hoje = () => new Date().toISOString().slice(0, 10);

export function NovaOcorrencia({
  onBack,
  onSalvar,
  salvando,
}: {
  onBack: () => void;
  onSalvar: (dados: DadosOcorrencia) => void;
  salvando: boolean;
}) {
  const obrasCache = useLiveQuery(() => db.obras.toArray(), [], []);
  const obras = useMemo(() => obrasCache.filter((o) => aceitaNovaInspecao(o.status)), [obrasCache]);
  const contratadasCache = useLiveQuery(() => db.contratadas.toArray(), [], []);
  const contratadas = contratadasCache.filter((c) => c.ativa);

  const [obraId, setObraId] = useState("");
  const [tipo, setTipo] = useState<TipoOcorrencia>("dano_material");
  const [data, setData] = useState(hoje());
  const [contratadaId, setContratadaId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [fotos, setFotos] = useState<{ blob: Blob; preview: string }[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function adicionarFoto(file: File | undefined) {
    if (!file) return;
    try {
      const { blob, preview } = await processarFoto(file);
      setFotos((f) => [...f, { blob, preview }]);
    } catch {
      /* imagem inválida — ignora */
    }
  }

  const pronto = !!obraId && descricao.trim().length > 0 && !salvando;

  function salvar() {
    onSalvar({
      obra_id: obraId,
      contratada_id: contratadaId || null,
      tipo,
      data,
      descricao,
      fotos: fotos.map((f) => f.blob),
    });
  }

  return (
    <div>
      <Header titulo="Nova ocorrência" sub="Dano ou acidente (Pirâmide de Bird)" onBack={onBack} />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={campo}>
          <span style={rotulo}>Obra</span>
          <select value={obraId} onChange={(e) => setObraId(e.target.value)} style={inputStyle}>
            <option value="">Selecione a obra…</option>
            {obras.map((o) => (
              <option key={o.id} value={o.id}>{o.nome}</option>
            ))}
          </select>
        </label>

        <label style={campo}>
          <span style={rotulo}>Tipo de ocorrência</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoOcorrencia)} style={inputStyle}>
            {TIPOS.map((t) => (
              <option key={t} value={t}>{ROTULO_OCORRENCIA[t]}</option>
            ))}
          </select>
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={campo}>
            <span style={rotulo}>Data</span>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} style={inputStyle} />
          </label>
          <label style={campo}>
            <span style={rotulo}>Contratada (opcional)</span>
            <select value={contratadaId} onChange={(e) => setContratadaId(e.target.value)} style={inputStyle}>
              <option value="">—</option>
              {contratadas.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </label>
        </div>

        <label style={campo}>
          <span style={rotulo}>Descrição</span>
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="O que aconteceu, onde e como (obrigatório)…"
            rows={3}
            style={{ ...inputStyle, fontSize: 15, resize: "vertical" }}
          />
        </label>

        <Card>
          <div style={rotulo}>Fotos ({fotos.length})</div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => void adicionarFoto(e.target.files?.[0])}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {fotos.map((f, i) => (
              <div key={i} style={{ position: "relative" }}>
                <img src={f.preview} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8 }} />
                <button
                  onClick={() => setFotos((arr) => arr.filter((_, j) => j !== i))}
                  aria-label="Remover"
                  style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 999, border: "none", background: T.red, color: "#fff", fontWeight: 700, cursor: "pointer" }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              onClick={() => fileRef.current?.click()}
              style={{ width: 72, height: 72, borderRadius: 8, border: `2px dashed ${T.yellowDark}`, background: "#FFF8E6", color: T.yellowDark, fontWeight: 700, cursor: "pointer", fontSize: 22 }}
            >
              📷
            </button>
          </div>
        </Card>

        <Botao onClick={salvar} disabled={!pronto}>
          {salvando ? "Salvando…" : "Salvar ocorrência"}
        </Botao>
        <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5 }}>
          Salva no aparelho na hora; havendo rede, sobe automaticamente.
        </div>
      </div>
    </div>
  );
}

const campo = { display: "flex", flexDirection: "column", gap: 6 } as const;
const rotulo = { fontSize: 13, fontWeight: 600, color: T.inkSoft, fontFamily: FONT_HEAD, textTransform: "uppercase", letterSpacing: 0.3 } as const;
