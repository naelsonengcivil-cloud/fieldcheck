import { supabase } from "@/lib/supabase";
import { uuid } from "@/lib/inspecaoService";
import { rotuloModulo } from "@/lib/catalogoDimensoes";
import type { Checklist, ItemChecklist, ModuloChecklist, TipoChecklist } from "@/types/db";

// ============================================================
// Checklists personalizados da empresa (Marco E). Admin cria/edita/clona
// checklists com empresa_id; RLS já restringe a escrita à empresa (0003).
// Código gerado por prefixo do módulo + sequência (…-Pnn = personalizado).
// ============================================================

const MOD_PREFIX: Record<ModuloChecklist, string> = {
  civil: "CV",
  edificacoes: "ED",
  reformas: "RF",
  eletromecanica: "EM",
  eletrica: "EL",
  comissionamento: "CM",
  linhas_transmissao: "LT",
  telecom: "TC",
  transversal: "TR",
};

/** Gera um código único da empresa: {PREFIXO}-P{NN}. */
export function gerarCodigo(modulo: ModuloChecklist, checklistsEmpresa: Checklist[]): string {
  const pfx = MOD_PREFIX[modulo] ?? "PS";
  const nums = checklistsEmpresa
    .map((c) => {
      const m = c.codigo.match(new RegExp(`^${pfx}-P(\\d+)$`));
      return m ? Number(m[1]) : 0;
    })
    .filter((n) => n > 0);
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${pfx}-P${String(next).padStart(2, "0")}`;
}

export interface DadosChecklistCustom {
  id?: string; // definido = edição
  codigo: string;
  modulo: ModuloChecklist;
  tipo: TipoChecklist;
  nome: string;
  fase: string | null;
  referencia_documento: string | null;
  nrs_relacionadas: string[];
  exige_projeto_ref: boolean;
}
export interface ItemCustom {
  ordem: number;
  texto: string;
  criterio: string | null;
}

/** Cria/atualiza o checklist personalizado + seus itens. @returns id. */
export async function salvarChecklistCustom(
  empresaId: string,
  dados: DadosChecklistCustom,
  itens: ItemCustom[],
): Promise<{ id: string | null; error: string | null }> {
  const ckId = dados.id ?? uuid();
  const linha = {
    id: ckId,
    empresa_id: empresaId,
    codigo: dados.codigo,
    area: rotuloModulo(dados.modulo),
    referencia: dados.referencia_documento,
    nome: dados.nome.trim(),
    versao: 1,
    ativo: true,
    modulo: dados.modulo,
    tipo: dados.tipo,
    fase: dados.fase,
    referencia_documento: dados.referencia_documento,
    nrs_relacionadas: dados.nrs_relacionadas.length ? dados.nrs_relacionadas : null,
    exige_projeto_ref: dados.exige_projeto_ref,
  };
  const upC = await supabase.from("checklists").upsert(linha, { onConflict: "id" });
  if (upC.error) return { id: null, error: traduz(upC.error.message) };

  // Recria os itens (evita ordem órfã). Só é seguro porque itens de checklist
  // personalizado recém-editado normalmente não têm respostas; se tiver, o
  // delete falha e mantemos os antigos (upsert por id abaixo cobre a edição).
  if (dados.id) await supabase.from("itens_checklist").delete().eq("checklist_id", ckId);
  const rows = itens
    .filter((i) => i.texto.trim())
    .map((i) => ({ id: uuid(), checklist_id: ckId, ordem: i.ordem, texto: i.texto.trim(), criterio: i.criterio?.trim() || null }));
  if (rows.length) {
    const upI = await supabase.from("itens_checklist").insert(rows);
    if (upI.error) return { id: null, error: traduz(upI.error.message) };
  }
  return { id: ckId, error: null };
}

/** Exclui um checklist personalizado (só se não tiver inspeções). */
export async function excluirChecklistCustom(id: string): Promise<{ error: string | null }> {
  const { count } = await supabase.from("inspecoes").select("id", { count: "exact", head: true }).eq("checklist_id", id);
  if ((count ?? 0) > 0) return { error: "Checklist com inspeções — não pode ser excluído." };
  await supabase.from("itens_checklist").delete().eq("checklist_id", id);
  const { error } = await supabase.from("checklists").delete().eq("id", id);
  return { error: error ? traduz(error.message) : null };
}

/** Prepara os dados de um checklist padrão para clonar (novo código custom). */
export function prepararClone(
  base: Checklist,
  itens: ItemChecklist[],
  novoCodigo: string,
): { dados: DadosChecklistCustom; itens: ItemCustom[] } {
  return {
    dados: {
      codigo: novoCodigo,
      modulo: (base.modulo ?? "transversal") as ModuloChecklist,
      tipo: (base.tipo ?? "qualidade") as TipoChecklist,
      nome: `${base.nome} (cópia)`,
      fase: base.fase ?? null,
      referencia_documento: base.referencia_documento ?? base.referencia ?? null,
      nrs_relacionadas: base.nrs_relacionadas ?? [],
      exige_projeto_ref: !!base.exige_projeto_ref,
    },
    itens: [...itens]
      .sort((a, b) => a.ordem - b.ordem)
      .map((i, idx) => ({ ordem: idx + 1, texto: i.texto, criterio: i.criterio })),
  };
}

function traduz(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("row-level security") || m.includes("permission")) return "Apenas administradores criam checklists.";
  if (m.includes("foreign key") || m.includes("referenced")) return "Checklist em uso — não pode ser alterado assim.";
  return "Não foi possível salvar. Tente novamente.";
}
