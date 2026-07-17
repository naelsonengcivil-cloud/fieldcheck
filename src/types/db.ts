// ============================================================
// Tipos das linhas do banco (espelham ESPECIFICACAO.md §4).
// Expandido conforme os marcos avançam.
// ============================================================

export type Papel = "inspetor" | "gestor" | "admin" | "executora";
export type PlanoEmpresa = "trial" | "ativo" | "suspenso";
export type StatusInspecao = "rascunho" | "finalizada";
export type Resposta = "C" | "NC" | "NA";
// Criticidade estruturada da NC (Marco I).
export type Criticidade = "baixa" | "media" | "alta" | "critica";
// Ciclo de tratamento de NC (Marco B1). Legados 'em_andamento'/'fechado'
// mantidos por compatibilidade; o fluxo novo usa aberto→tratada→aprovada|reaberta.
export type StatusEvento =
  | "aberto"
  | "em_andamento"
  | "tratada"
  | "aprovada"
  | "reaberta"
  | "fechado";

export interface Empresa {
  id: string;
  nome: string;
  plano: PlanoEmpresa;
  trial_expira_em: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  assinatura_ativa_ate: string | null;
  cortesia_ate?: string | null; // acesso gratuito concedido pelo operador (Marco F)
  prazos_nc?: Record<Criticidade, number> | null; // dias de prazo por criticidade (Marco I)
  logo_url?: string | null; // caminho do logo no bucket público 'logos' (Marco J)
  ia_habilitada?: boolean; // liga/desliga redação assistida por IA nas RNCs (Marco K, K2); default true
  alertas_habilitado?: boolean; // liga/desliga o assistente de alertas (Marco L); default true
  alertas_ia_habilitado?: boolean; // liga/desliga a análise por IA nos alertas (Marco L, fase 3); default true
  alertas_frequencia?: "semanal" | "diario"; // frequência do digest (Marco L); default 'semanal'
  criado_em: string;
}

export interface Usuario {
  id: string;
  empresa_id: string;
  nome: string;
  papel: Papel;
  ativo: boolean;
  contratada_id?: string | null; // vínculo do papel executora (Marco B2)
  notif_push?: boolean; // opt-out de push por usuário (RF12/M6); default true
  notif_email?: boolean; // opt-out do resumo semanal por e-mail (RF17); default true
}

// Empresa executora (contratada) sob a empresa cliente (Marco B2/M17).
export interface Contratada {
  id: string;
  empresa_id: string;
  nome: string;
  cnpj: string | null;
  ativa: boolean;
}

export type StatusObra = "em_andamento" | "finalizada" | "arquivada";

export interface Obra {
  id: string;
  empresa_id: string;
  nome: string;
  cliente: string | null;
  status: StatusObra;
  ativa: boolean; // deprecado (mantido durante a transição da migration 0010)
  kit_id?: string | null; // kit de obra adotado (Marco E)
}

// Dimensões do catálogo v2 (Marco E).
export type ModuloChecklist =
  | "civil"
  | "eletromecanica"
  | "eletrica"
  | "comissionamento"
  | "linhas_transmissao"
  | "telecom"
  | "edificacoes"
  | "reformas"
  | "transversal";

export type TipoChecklist =
  | "seguranca_nr"
  | "meio_ambiente"
  | "qualidade"
  | "documentacao"
  | "equipamentos"
  | "execucao";

export interface Checklist {
  id: string;
  empresa_id: string | null;
  codigo: string;
  area: string;
  referencia: string | null;
  nome: string;
  versao: number;
  ativo: boolean;
  modulo?: ModuloChecklist | null;
  tipo?: TipoChecklist | null;
  fase?: string | null;
  referencia_documento?: string | null;
  nrs_relacionadas?: string[] | null;
  exige_projeto_ref?: boolean;
}

// Kits de Obra (Marco E): modelos do sistema (empresa_id null) ou da empresa.
export interface Kit {
  id: string;
  empresa_id: string | null;
  nome: string;
  descricao: string | null;
  ativo: boolean;
}
export interface KitChecklist {
  kit_id: string;
  checklist_id: string;
}

// Classificação de NC de Segurança do Trabalho (base da Pirâmide de Bird, A2).
// 'na' (melhoria 2): item documental que não se encaixa na pirâmide — exige
// justificativa e fica fora do cálculo de Bird (mas conta nos demais KPIs).
export type ClassificacaoST = "ato_inseguro" | "condicao_insegura" | "quase_acidente" | "na";

export interface ItemChecklist {
  id: string;
  checklist_id: string;
  ordem: number;
  texto: string;
  criterio: string | null;
  classificacao_st_sugerida?: ClassificacaoST | null; // default sugerido p/ NC em ST
  texto_base_rnc?: string | null; // texto-base opcional p/ RNC (checklist personalizado, passo 4)
}

// Ocorrências (danos/acidentes) — níveis superiores da Pirâmide de Bird (A2).
export type TipoOcorrencia =
  | "dano_material"
  | "acidente_sem_afastamento"
  | "acidente_com_afastamento";

export interface Ocorrencia {
  id: string;
  empresa_id: string;
  obra_id: string;
  contratada_id: string | null;
  tipo: TipoOcorrencia;
  data: string; // YYYY-MM-DD
  descricao: string;
  criado_por: string | null;
  criado_em: string;
}

// Histórico do ciclo de tratamento de NC (Marco B1) — gravado pelas RPCs.
export interface NcTransicao {
  id: string;
  evento_id: string;
  empresa_id: string;
  de_status: StatusEvento | null;
  para_status: StatusEvento;
  ator_id: string | null;
  ator_nome: string | null;
  comentario: string | null;
  criado_em: string;
}

// Notificações do ciclo de NC (N1) — uma linha por destinatário.
export type TipoNotificacao =
  | "nc_atribuida"
  | "nc_reaberta"
  | "nc_aguardando_aprovacao"
  | "nc_aprovada"
  | "nc_prazo_proximo"
  | "nc_prazo_vencido"
  | "alerta_inteligente"; // Marco L — digest de alertas (gestor/admin)

export interface Notificacao {
  id: string;
  empresa_id: string;
  usuario_id: string;
  tipo: TipoNotificacao;
  titulo: string;
  corpo: string | null;
  evento_id: string | null;
  lida_em: string | null;
  criado_em: string;
}

// ============================================================
// Marco L — Assistente de Alertas Inteligentes (Fase 1: detecção sem IA).
// ============================================================
export type SeveridadeAlerta = "info" | "atencao" | "critico";
export type TipoAlerta =
  | "nc_vencidas_obra"
  | "reincidencia_item"
  | "contratada_degradada"
  | "conformidade_baixa";

export interface Alerta {
  id: string;
  empresa_id: string;
  tipo: TipoAlerta;
  severidade: SeveridadeAlerta;
  titulo: string;
  corpo: string;
  /** Números + tamanho de amostra que originaram o alerta (transparência). */
  dados_fonte: Record<string, unknown>;
  obra_id: string | null;
  chave_dedup: string;
  origem_ia: boolean;
  analise_ia: string | null; // Fase 2
  notificado_em: string | null;
  criado_em: string;
  lido_em: string | null;
}

export type StatusConvite = "pendente" | "aceito" | "cancelado";

export interface Convite {
  id: string;
  empresa_id: string;
  email: string;
  papel: Papel;
  contratada_id?: string | null; // definido quando o convite é p/ executora
  status: StatusConvite;
  criado_em: string;
  expira_em: string;
}

// ============================================================
// Módulo RNC (Relatório de Não Conformidade) — Marco RNC.
// ============================================================
export type RncGravidade = "critica" | "maior" | "menor" | "observacao";
export type RncStatus =
  | "aberta"
  | "em_tratamento"
  | "aguardando_reinspecao"
  | "fechada"
  | "cancelada";

/** As 4 seções normativas geradas (texto do agente / versão final). */
export interface RncSecoesTexto {
  requisito: string;
  fundamentacao: string;
  risco: string;
  acao: string;
}

/** Seção padrão do relatório (referência — 12 linhas de rnc_secoes). */
export interface RncSecao {
  ordem: number;
  secao: string;
  conteudo_instrucao: string;
  origem_dado: string;
  editavel: boolean;
}

/** Instância de RNC gerada. */
export interface Rnc {
  id: string;
  numero: string;
  empresa_id: string;
  obra_id: string;
  inspecao_id: string;
  resposta_item_id: string;
  modelo_id: string;
  checklist_codigo: string;
  item_numero: number;
  local: string | null;
  ativo: string | null;
  descricao_nc: string;
  fotos: string[];
  gravidade: RncGravidade;
  gravidade_sugerida_agente: RncGravidade | null;
  criticidade: string | null; // espelho p/ Marco I
  secoes_agente: RncSecoesTexto | null; // null = fallback sem IA
  secoes_final: RncSecoesTexto;
  risco_complementar: string | null;
  acao_complementar: string | null;
  prazo_dias: number | null;
  responsavel: string | null;
  status: RncStatus;
  reinspecao_resultado: string | null;
  fotos_correcao: string[];
  data_fechamento: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}
