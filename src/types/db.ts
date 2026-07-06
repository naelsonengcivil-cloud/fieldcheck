// ============================================================
// Tipos das linhas do banco (espelham ESPECIFICACAO.md §4).
// Expandido conforme os marcos avançam.
// ============================================================

export type Papel = "inspetor" | "gestor" | "admin";
export type PlanoEmpresa = "trial" | "ativo" | "suspenso";
export type StatusInspecao = "rascunho" | "finalizada";
export type Resposta = "C" | "NC" | "NA";
export type StatusEvento = "aberto" | "em_andamento" | "fechado";

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

export interface ItemChecklist {
  id: string;
  checklist_id: string;
  ordem: number;
  texto: string;
  criterio: string | null;
}

export type StatusConvite = "pendente" | "aceito" | "cancelado";

export interface Convite {
  id: string;
  empresa_id: string;
  email: string;
  papel: Papel;
  status: StatusConvite;
  criado_em: string;
  expira_em: string;
}
