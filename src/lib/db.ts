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
  TriagemIa,
  Criticidade,
  Kit,
  KitChecklist,
} from "@/types/db";

// ============================================================
// Armazenamento local (IndexedDB via Dexie) — base do offline-first.
// §7.1: toda escrita vai primeiro ao IndexedDB com sync='pendente' e
// UUID gerado no cliente. O worker (sync.ts) sobe quando há rede.
// ============================================================

export type SyncStatus = "pendente" | "sincronizado" | "erro";

/** Metadados de fila de sync por item (Entrega C) — diagnóstico + backoff. */
export interface SyncMeta {
  sync: SyncStatus;
  tentativas?: number; // nº de falhas de envio
  proxima_tentativa?: number; // epoch ms; retry transitório com backoff (0 = já)
  ultima_tentativa_em?: string | null; // ISO da última falha
  ultimo_status_http?: number | null; // código HTTP da última falha
  ultimo_erro?: string | null; // mensagem/código legível da última falha
}

export interface LocalInspecao extends SyncMeta {
  id: string; // UUID gerado no cliente (idempotência §7.3)
  empresa_id: string;
  obra_id: string;
  checklist_id: string;
  inspetor_id: string;
  frente: string | null;
  contratada: string | null;
  iniciada_em: string;
  finalizada_em: string | null;
  data_inspecao: string | null; // data/hora INFORMADA da inspeção (registro retroativo, melhoria A)
  registrado_em: string | null; // carimbo de registro no sistema (server default; null até sincronizar)
  lat: number | null;
  lng: number | null;
  status: StatusInspecao;
  origem_offline: boolean;
  arquivada: boolean;
  contratada_id?: string | null; // contratada escolhida na criação (Marco B2)
  projeto_ref_numero?: string | null; // projeto de referência aprovado (Marco E)
  projeto_ref_revisao?: string | null;
  ref_cronograma_codigo?: string | null; // item de cronograma/escopo (melhoria 4)
  assinatura?: string | null; // assinatura do inspetor (PNG data URL) — Marco J
  origem_desvio_id?: string | null; // inspeção sintética de promoção de desvio (Marco M · 0064)
}

export interface LocalResposta extends SyncMeta {
  id: string;
  inspecao_id: string;
  item_id: string;
  resposta: Resposta;
  observacao: string | null;
  classificacao_st?: ClassificacaoST | null; // NC de ST: base da Pirâmide de Bird
  classificacao_st_justificativa?: string | null; // obrigatória quando 'na' (melhoria 2)
  criado_em: string;
}

// Ocorrência (dano/acidente) — offline-first, com fila de sync própria (A2).
export interface LocalOcorrencia extends SyncMeta {
  id: string;
  empresa_id: string;
  obra_id: string;
  contratada_id: string | null;
  tipo: TipoOcorrencia;
  data: string; // YYYY-MM-DD
  descricao: string;
  criado_por: string | null;
  criado_em: string;
  // Marco M (0059) — desvio avulso (opcionais: registros antigos não os têm).
  criticidade?: Criticidade | null;
  frente?: string | null;
  ref_cronograma_codigo?: string | null;
  ocorrida_em?: string | null;
  promovida_inspecao_id?: string | null;
  // Marco M (0060) — triagem por IA (sugestão gravada pela Edge; ver types).
  triagem_ia?: TriagemIa | null;
  triagem_em?: string | null;
  origem_ia?: boolean;
  editado_apos_ia?: boolean;
  // Marco M (0063) — edição + soft delete auditável.
  atualizado_em?: string | null;
  atualizado_por?: string | null;
  excluido_em?: string | null;
  excluido_por?: string | null;
  motivo_exclusao?: string | null;
}

export interface LocalEvento extends SyncMeta {
  id: string;
  resposta_id: string;
  empresa_id: string;
  obra_id: string;
  responsavel: string | null;
  prazo: string | null; // YYYY-MM-DD
  criticidade?: Criticidade | null; // Marco I (definida no registro, editável pelo gestor)
  status: StatusEvento;
  tratamento: string | null;
  contratada_id?: string | null; // denormalizado da inspeção (servidor, Marco B2)
  updated_at: string; // last-write-wins (§7.3)
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
  ultima_tentativa_em?: string | null; // Entrega C — diagnóstico
  ultimo_status_http?: number | null;
  ultimo_erro?: string | null;
}

/** Edição de RNC feita offline — aplicada ao servidor na reconexão. */
export interface RncEdicaoPendente {
  id: string; // rnc_id
  patch: Record<string, unknown>; // Partial<Rnc> a aplicar
  atualizado_em: string;
}

/** Log de descartes da fila de sync (Entrega C) — rastreabilidade mínima. */
export interface SyncDescarte {
  id: string; // id do item descartado
  tabela: string;
  tipo_operacao: string;
  referencia: string;
  conteudo: string; // JSON resumido do item
  descartado_em: string;
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
  kits!: Table<Kit, string>;
  kit_checklists!: Table<KitChecklist, [string, string]>;
  // Fila de geração de RNC offline (Marco RNC).
  rnc_pendentes!: Table<RncPendente, string>;
  // Fila de triagem por IA do desvio (Marco M · M-2) — processada pós-sync.
  triagem_pendentes!: Table<TriagemPendente, string>;
  // Log de descartes da fila de sync (Entrega C).
  sync_descartes!: Table<SyncDescarte, string>;
  // Edições de RNC feitas offline — aplicadas na reconexão.
  rnc_edicoes!: Table<RncEdicaoPendente, string>;
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
    // v8: kits de obra + composição (Marco E).
    this.version(8).stores({
      kits: "id, empresa_id",
      kit_checklists: "[kit_id+checklist_id], kit_id, checklist_id",
    });
    // v9: fila de geração de RNC offline (Marco RNC) — gerada no reconnect.
    this.version(9).stores({
      rnc_pendentes: "resposta_item_id, criado_em",
    });
    this.version(10).stores({
      triagem_pendentes: "ocorrencia_id, criado_em",
    });
    this.version(11).stores({
      sync_descartes: "id, descartado_em",
    });
    this.version(12).stores({
      rnc_edicoes: "id, atualizado_em",
    });
  }
}

// Pedido de triagem por IA feito offline (ou agendado) — processado após a
// sincronização subir o desvio e as fotos (a análise roda na Edge Function).
export interface TriagemPendente {
  ocorrencia_id: string;
  criado_em: string;
  tentativas?: number;
}

// Pedido de geração de RNC feito offline — processado ao reconectar (a Edge
// Function roda no servidor, não no dispositivo). Chave = resposta reprovada.
export interface RncPendente {
  resposta_item_id: string;
  local: string;
  ativo: string;
  descricao_nc: string;
  criado_em: string;
}

export const db = new FieldCheckDB();
