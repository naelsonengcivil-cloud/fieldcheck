import Dexie, { type Table } from "dexie";
import type {
  Resposta,
  StatusInspecao,
  StatusEvento,
  NcTransicao,
  Obra,
  Checklist,
  ItemChecklist,
  Usuario,
  Contratada,
  Notificacao,
  ClassificacaoST,
  TipoOcorrencia,
} from "@/types/db";

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
  arquivada: boolean;
  contratada_id?: string | null; // contratada escolhida na criação (Marco B2)
  sync: SyncStatus;
}

export interface LocalResposta {
  id: string;
  inspecao_id: string;
  item_id: string;
  resposta: Resposta;
  observacao: string | null;
  classificacao_st?: ClassificacaoST | null; // NC de ST: base da Pirâmide de Bird
  criado_em: string;
  sync: SyncStatus;
}

// Ocorrência (dano/acidente) — offline-first, com fila de sync própria (A2).
export interface LocalOcorrencia {
  id: string;
  empresa_id: string;
  obra_id: string;
  contratada_id: string | null;
  tipo: TipoOcorrencia;
  data: string; // YYYY-MM-DD
  descricao: string;
  criado_por: string | null;
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
  contratada_id?: string | null; // denormalizado da inspeção (servidor, Marco B2)
  updated_at: string; // last-write-wins (§7.3)
  sync: SyncStatus;
}

export interface LocalEvidencia {
  id: string;
  resposta_id: string | null;
  evento_id: string | null;
  ocorrencia_id?: string | null;
  tipo: "abertura" | "fechamento" | "tratamento" | "conformidade" | "ocorrencia";
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
  ocorrencias!: Table<LocalOcorrencia, string>;
  // Cache de referência (baixado do Supabase; leitura offline) — sem fila de sync.
  obras!: Table<Obra, string>;
  checklists!: Table<Checklist, string>;
  itens!: Table<ItemChecklist, string>;
  usuarios!: Table<Usuario, string>;
  contratadas!: Table<Contratada, string>;
  // Notificações do ciclo (N1) — espelho do servidor; "lida" via update.
  notificacoes!: Table<Notificacao, string>;
  // Histórico do ciclo de NC (Marco B1) — só leitura; gravado pelas RPCs.
  nc_transicoes!: Table<NcTransicao, string>;

  constructor(nome = "fieldcheck") {
    super(nome);
    // Índices por `sync` para a varredura da fila; FKs locais para ordenar o envio.
    this.version(1).stores({
      inspecoes: "id, sync, obra_id, status",
      respostas: "id, inspecao_id, sync",
      eventos: "id, resposta_id, sync, updated_at",
      evidencias: "id, sync, resposta_id, evento_id",
    });
    // v2: cache local do catálogo (obras + checklists + itens) p/ uso offline.
    this.version(2).stores({
      obras: "id, empresa_id",
      checklists: "id, empresa_id, codigo",
      itens: "id, checklist_id, ordem",
    });
    // v3: cache de usuários da empresa (nomes de inspetores p/ Home/Obra/detalhe).
    this.version(3).stores({
      usuarios: "id, empresa_id",
    });
    // v4: histórico do ciclo de tratamento de NC (Marco B1).
    this.version(4).stores({
      nc_transicoes: "id, evento_id, empresa_id, criado_em",
    });
    // v5: cache de contratadas (Marco B2/M17).
    this.version(5).stores({
      contratadas: "id, empresa_id",
    });
    // v6: notificações do ciclo de NC (N1).
    this.version(6).stores({
      notificacoes: "id, usuario_id, lida_em, criado_em",
    });
    // v7: ocorrências (offline) + índice de evidências por ocorrência (A2).
    this.version(7).stores({
      ocorrencias: "id, sync, obra_id, empresa_id",
      evidencias: "id, sync, resposta_id, evento_id, ocorrencia_id",
    });
  }
}

export const db = new FieldCheckDB();
