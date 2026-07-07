import type { ModuloChecklist, TipoChecklist } from "@/types/db";

// ============================================================
// Rótulos legíveis das dimensões do catálogo v2 (Marco E) — puros.
// ============================================================

export const ROTULO_MODULO: Record<ModuloChecklist, string> = {
  civil: "Civil",
  eletromecanica: "Eletromecânica",
  eletrica: "Elétrica",
  comissionamento: "Comissionamento",
  linhas_transmissao: "Linhas de Transmissão",
  telecom: "Telecom",
  edificacoes: "Edificações",
  reformas: "Reformas",
  transversal: "Transversal (SSMA e Gestão)",
};

export const ROTULO_TIPO: Record<TipoChecklist, string> = {
  seguranca_nr: "Segurança (NR)",
  meio_ambiente: "Meio Ambiente",
  qualidade: "Qualidade",
  documentacao: "Documentação",
  equipamentos: "Equipamentos",
  execucao: "Execução/Processo",
};

// Ordem de exibição dos módulos (transversal por último — é o "guarda-chuva").
export const MODULOS: ModuloChecklist[] = [
  "civil",
  "edificacoes",
  "reformas",
  "eletromecanica",
  "eletrica",
  "comissionamento",
  "linhas_transmissao",
  "telecom",
  "transversal",
];

export const TIPOS: TipoChecklist[] = [
  "seguranca_nr",
  "meio_ambiente",
  "qualidade",
  "documentacao",
  "equipamentos",
  "execucao",
];

export const rotuloModulo = (m: string | null | undefined) =>
  m ? (ROTULO_MODULO[m as ModuloChecklist] ?? m) : "Sem módulo";
export const rotuloTipo = (t: string | null | undefined) =>
  t ? (ROTULO_TIPO[t as TipoChecklist] ?? t) : "—";
