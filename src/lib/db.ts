import Dexie, { type Table } from "dexie";
import type { Resposta, StatusInspecao, StatusEvento } from "@/types/db";

// ============================================================
// Armazenamento local (IndexedDB via Dexie) — base do offline-first.
// §7.1: toda escrita vai primeiro ao IndexedDB com sync='pendente' e
// UUID gerado no cliente. O worker (sync.ts) sobe quando há rede.
// ============================================================

export type SyncStatus = "pendente" | "sincronizado" | "erro";

export interface LocalInspecao {
  id: string; // UUID gerado no cliente (idempotência §7.3)
  empresa_id: string;
  obra_id: string;
  checklist_id: string;
  inspetor_id: string;
  frente: string | null;
  contratada: string | null;
  iniciada_em: string;
  finalizada_em: string | null;
  lat: number | null;
  lng: number | null;
  status: StatusInspecao;
  origem_offline: boolean;
  sync: SyncStatus;
}

export interface LocalResposta {
  id: string;
  inspecao_id: string;
  item_id: string;
  resposta: Resposta;
  observacao: string | null;
  criado_em: string;
  sync: SyncStatus;
}

export interface LocalEvento {
  id: string;
  resposta_id: string;
  empresa_id: string;
  obra_id: string;
  responsavel: string | null;
  prazo: string | null; // YYYY-MM-DD
  status: StatusEvento;
  tratamento: string | null;
  updated_at: string; // last-write-wins (§7.3)
  sync: SyncStatus;
}

export interface LocalEvidencia {
  id: string;
  resposta_id: string | null;
  evento_id: string | null;
  tipo: "abertura" | "fechamento";
  blob: Blob | null; // foto comprimida guardada localmente até o upload
  url: string | null; // caminho no Storage após subir
  lat: number | null;
  lng: number | null;
  capturada_em: string;
  sync: SyncStatus;
  tentativas: number; // nº de falhas de upload (backoff §7.4)
  proxima_tentativa: number; // epoch ms; 0 = pode tentar já
}

export class FieldCheckDB extends Dexie {
  inspecoes!: Table<LocalInspecao, string>;
  respostas!: Table<LocalResposta, string>;
  eventos!: Table<LocalEvento, string>;
  evidencias!: Table<LocalEvidencia, string>;

  constructor(nome = "fieldcheck") {
    super(nome);
    // Índices por `sync` para a varredura da fila; FKs locais para ordenar o envio.
    this.version(1).stores({
      inspecoes: "id, sync, obra_id, status",
      respostas: "id, inspecao_id, sync",
      eventos: "id, resposta_id, sync, updated_at",
      evidencias: "id, sync, resposta_id, evento_id",
    });
  }
}

export const db = new FieldCheckDB();
