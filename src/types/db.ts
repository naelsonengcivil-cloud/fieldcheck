// ============================================================
// Tipos das linhas do banco (espelham ESPECIFICACAO.md §4).
// Expandido conforme os marcos avançam.
// ============================================================

export type Papel = "inspetor" | "gestor" | "admin" | "executora";
export type PlanoEmpresa = "trial" | "ativo" | "suspenso";
export type StatusInspecao = "rascunho" | "finalizada";
export type Resposta = "C" | "NC" | "NA";
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
  criado_em: string;
}

export interface Usuario {
  id: string;
  empresa_id: string;
  nome: string;
  papel: Papel;
  ativo: boolean;
  contratada_id?: string | null; // vínculo do papel executora (Marco B2)
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
}

export interface Checklist {
  id: string;
  empresa_id: string | null;
  codigo: string;
  area: string;
  referencia: string | null;
  nome: string;
  versao: number;
  ativo: boolean;
}

// Classificação de NC de Segurança do Trabalho (base da Pirâmide de Bird, A2).
export type ClassificacaoST = "ato_inseguro" | "condicao_insegura" | "quase_acidente";

export interface ItemChecklist {
  id: string;
  checklist_id: string;
  ordem: number;
  texto: string;
  criterio: string | null;
  classificacao_st_sugerida?: ClassificacaoST | null; // default sugerido p/ NC em ST
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
  | "nc_aprovada";

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
