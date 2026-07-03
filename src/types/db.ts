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
  criado_em: string;
}

export interface Usuario {
  id: string;
  empresa_id: string;
  nome: string;
  papel: Papel;
  ativo: boolean;
}

export interface Obra {
  id: string;
  empresa_id: string;
  nome: string;
  cliente: string | null;
  ativa: boolean;
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
