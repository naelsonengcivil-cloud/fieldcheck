import { supabase } from "@/lib/supabase";
import { uuid } from "@/lib/inspecaoService";

// ============================================================
// Kits de Obra da empresa (Marco E · E6). Admin compõe kits (conjunto de
// checklists) e a obra adota um kit. RLS restringe a escrita à empresa.
// ============================================================

export async function salvarKit(
  empresaId: string,
  kit: { id?: string; nome: string; descricao?: string | null },
  checklistIds: string[],
): Promise<{ id: string | null; error: string | null }> {
  if (!kit.nome.trim()) return { id: null, error: "Informe o nome do kit." };
  const id = kit.id ?? uuid();
  const up = await supabase
    .from("kits")
    .upsert({ id, empresa_id: empresaId, nome: kit.nome.trim(), descricao: kit.descricao ?? null, ativo: true }, { onConflict: "id" });
  if (up.error) return { id: null, error: traduz(up.error.message) };

  await supabase.from("kit_checklists").delete().eq("kit_id", id);
  if (checklistIds.length) {
    const rows = checklistIds.map((cid) => ({ kit_id: id, checklist_id: cid }));
    const ins = await supabase.from("kit_checklists").insert(rows);
    if (ins.error) return { id: null, error: traduz(ins.error.message) };
  }
  return { id, error: null };
}

export async function excluirKit(id: string): Promise<{ error: string | null }> {
  const { count } = await supabase.from("obras").select("id", { count: "exact", head: true }).eq("kit_id", id);
  if ((count ?? 0) > 0) return { error: "Kit adotado por obra(s) — desvincule antes de excluir." };
  const { error } = await supabase.from("kits").delete().eq("id", id);
  return { error: error ? traduz(error.message) : null };
}

/** Obra adota (ou desadota) um kit. */
export async function definirKitDaObra(obraId: string, kitId: string | null): Promise<{ error: string | null }> {
  const { error } = await supabase.from("obras").update({ kit_id: kitId }).eq("id", obraId);
  return { error: error ? traduz(error.message) : null };
}

function traduz(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("row-level security") || m.includes("permission")) return "Apenas administradores gerenciam kits.";
  return "Não foi possível salvar. Tente novamente.";
}
