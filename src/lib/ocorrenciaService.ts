import { db, type LocalOcorrencia, type LocalEvidencia } from "@/lib/db";
import { uuid } from "@/lib/inspecaoService";
import type { TipoOcorrencia } from "@/types/db";

// ============================================================
// Ocorrências (danos/acidentes) — offline-first (A2). Grava no Dexie
// como 'pendente'; a fila (sync.ts) sobe quando houver rede. Fotos viram
// evidências tipo 'ocorrencia' ligadas à ocorrência.
// ============================================================

export interface DadosOcorrencia {
  obra_id: string;
  contratada_id: string | null;
  tipo: TipoOcorrencia;
  data: string; // YYYY-MM-DD
  descricao: string;
  fotos: Blob[];
}

export interface ContextoOcorrencia {
  empresaId: string;
  criadoPor: string;
}

/** Persiste a ocorrência + fotos no Dexie como 'pendente'. @returns id. */
export async function salvarOcorrenciaLocal(
  dados: DadosOcorrencia,
  ctx: ContextoOcorrencia,
): Promise<string> {
  if (!dados.obra_id) throw new Error("Selecione a obra.");
  if (!dados.descricao.trim()) throw new Error("Descreva a ocorrência.");

  const id = uuid();
  const agora = new Date().toISOString();
  const ocorrencia: LocalOcorrencia = {
    id,
    empresa_id: ctx.empresaId,
    obra_id: dados.obra_id,
    contratada_id: dados.contratada_id,
    tipo: dados.tipo,
    data: dados.data,
    descricao: dados.descricao.trim(),
    criado_por: ctx.criadoPor,
    criado_em: agora,
    sync: "pendente",
  };
  const evidencias: LocalEvidencia[] = dados.fotos.map((blob) => ({
    id: uuid(),
    resposta_id: null,
    evento_id: null,
    ocorrencia_id: id,
    tipo: "ocorrencia",
    blob,
    url: null,
    lat: null,
    lng: null,
    capturada_em: agora,
    sync: "pendente",
    tentativas: 0,
    proxima_tentativa: 0,
  }));

  await db.transaction("rw", db.ocorrencias, db.evidencias, async () => {
    await db.ocorrencias.put(ocorrencia);
    if (evidencias.length) await db.evidencias.bulkPut(evidencias);
  });
  return id;
}

export const ROTULO_OCORRENCIA: Record<TipoOcorrencia, string> = {
  dano_material: "Dano material",
  acidente_sem_afastamento: "Acidente sem afastamento",
  acidente_com_afastamento: "Acidente com afastamento",
};
