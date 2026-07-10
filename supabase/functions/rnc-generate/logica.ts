// ============================================================
// Lógica PURA da geração de RNC (Marco RNC) — interpolação determinística,
// gravidade e parse da saída da IA. Sem dependências nem APIs de runtime
// (nada de Deno/fetch/npm), para ser importável tanto pela Edge Function
// (Deno, index.ts) quanto pelos testes (vitest).
// ============================================================

export const VALID_GRAV = new Set(["critica", "maior", "menor", "observacao"]);

export interface SecoesTexto {
  requisito: string;
  fundamentacao: string;
  risco: string;
  acao: string;
}

export interface TextoBase {
  texto_requisito_descumprido: string;
  texto_fundamentacao_normativa: string;
  texto_risco_consequencia: string;
  texto_acao_corretiva: string;
}

/** Contexto para montar o mapa de placeholders (dados de plataforma + campo). */
export interface CtxInterpolacao {
  numero: string;
  obra: string;
  cliente: string;
  contratada: string;
  checklist_codigo: string;
  checklist_nome: string;
  criterio: string;
  item_numero: number | string;
  item_verificacao: string;
  data_inspecao_iso: string | null;
  inspetor: string;
  local: string;
  ativo: string;
  descricao_nc: string;
  exige_projeto_ref: boolean;
  projeto_num: string;
  projeto_rev: string;
}

/** ISO → DD/MM/AAAA (vazio se nulo). */
export function brData(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10).split("-").reverse().join("/");
}

/**
 * Mapa placeholder → valor. Placeholders de projeto só são preenchidos quando
 * o checklist exige projeto de referência; os de fechamento ({{prazo}},
 * {{responsavel}}, {{evidencia_foto_correcao}}, complementares, {{gravidade}},
 * {{status}}, {{data_fechamento}}, {{reinspecao_resultado}}) NÃO entram aqui —
 * permanecem no texto para a etapa de tratamento/formalização.
 */
export function montarValores(c: CtxInterpolacao): Record<string, string> {
  return {
    "{{numero_rnc}}": String(c.numero),
    "{{obra}}": c.obra ?? "",
    "{{cliente}}": c.cliente ?? "",
    "{{contratada}}": c.contratada ?? "",
    "{{checklist_codigo}}": c.checklist_codigo,
    "{{checklist_nome}}": c.checklist_nome,
    "{{criterio}}": c.criterio ?? "",
    "{{item_numero}}": String(c.item_numero),
    "{{item_verificacao}}": c.item_verificacao,
    "{{data_inspecao}}": brData(c.data_inspecao_iso),
    "{{inspetor}}": c.inspetor ?? "",
    "{{local}}": c.local ?? "",
    "{{ativo}}": c.ativo ?? "",
    "{{descricao_nc}}": c.descricao_nc ?? "",
    "{{evidencia_foto}}": "conforme registro fotográfico anexo",
    "{{projeto_num}}": c.exige_projeto_ref ? (c.projeto_num ?? "") : "",
    "{{projeto_rev}}": c.exige_projeto_ref ? (c.projeto_rev ?? "") : "",
  };
}

/** Substitui todos os placeholders conhecidos no texto (determinístico). */
export function interpolar(texto: string | null, valores: Record<string, string>): string {
  return Object.entries(valores).reduce((acc, [k, v]) => acc.split(k).join(v), texto ?? "");
}

/** Interpola as 4 seções normativas do texto-base. */
export function interpolarSecoes(base: TextoBase, valores: Record<string, string>): SecoesTexto {
  return {
    requisito: interpolar(base.texto_requisito_descumprido, valores),
    fundamentacao: interpolar(base.texto_fundamentacao_normativa, valores),
    risco: interpolar(base.texto_risco_consequencia, valores),
    acao: interpolar(base.texto_acao_corretiva, valores),
  };
}

/** "Maior — elevar a Crítica se..." → enum base. Default 'maior'. */
export function parseGravidade(texto: string): string {
  const t = (texto ?? "").toLowerCase();
  if (t.startsWith("crítica") || t.startsWith("critica")) return "critica";
  if (t.startsWith("maior")) return "maior";
  if (t.startsWith("menor")) return "menor";
  if (t.startsWith("observ")) return "observacao";
  return "maior";
}

export interface SaidaIA {
  secoes: SecoesTexto;
  gravidade_sugerida: string;
  risco_complementar_sugerido: string;
  acao_complementar_sugerido: string;
}

/**
 * Parse robusto da resposta da IA: tolera cercas markdown e texto em volta,
 * exige as 4 seções como strings. Retorna null quando inválido → o chamador
 * cai no fallback determinístico.
 */
export function tentarParse(texto: string): SaidaIA | null {
  if (!texto) return null;
  let s = texto.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const ini = s.indexOf("{");
  const fim = s.lastIndexOf("}");
  if (ini < 0 || fim <= ini) return null;
  s = s.slice(ini, fim + 1);
  try {
    const o = JSON.parse(s);
    if (
      !o?.secoes ||
      typeof o.secoes.requisito !== "string" ||
      typeof o.secoes.fundamentacao !== "string" ||
      typeof o.secoes.risco !== "string" ||
      typeof o.secoes.acao !== "string"
    ) {
      return null;
    }
    return {
      secoes: {
        requisito: o.secoes.requisito,
        fundamentacao: o.secoes.fundamentacao,
        risco: o.secoes.risco,
        acao: o.secoes.acao,
      },
      gravidade_sugerida: String(o.gravidade_sugerida ?? "").toLowerCase().trim(),
      risco_complementar_sugerido: String(o.risco_complementar_sugerido ?? "").trim(),
      acao_complementar_sugerido: String(o.acao_complementar_sugerido ?? "").trim(),
    };
  } catch {
    return null;
  }
}
