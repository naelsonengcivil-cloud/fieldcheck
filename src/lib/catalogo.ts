import type { SupabaseClient } from "@supabase/supabase-js";
import type { FieldCheckDB } from "@/lib/db";
import type { Obra, Checklist, ItemChecklist, Kit, KitChecklist } from "@/types/db";

// ============================================================
// Baixa o catálogo de referência (obras + checklists + itens) do
// Supabase para o Dexie, permitindo abrir inspeções 100% offline (RF03).
// Best-effort: se estiver sem rede, mantém o cache anterior.
// ============================================================

export interface ResumoCatalogo {
  obras: number;
  checklists: number;
  itens: number;
  kits: number;
}

/** Obras não-arquivadas; tolera bases pré-0010 (sem `status`) via `ativa`. */
async function baixarObras(supabase: SupabaseClient): Promise<Obra[]> {
  const r = await supabase.from("obras").select("*").neq("status", "arquivada");
  if (!r.error) return (r.data ?? []) as Obra[];
  const fb = await supabase.from("obras").select("*").eq("ativa", true);
  if (fb.error) throw fb.error;
  return (fb.data ?? []).map((o) => ({
    ...(o as Obra),
    status: (o as { ativa: boolean }).ativa ? "em_andamento" : "arquivada",
  }));
}

export async function baixarCatalogo(
  db: FieldCheckDB,
  supabase: SupabaseClient,
): Promise<ResumoCatalogo> {
  const [obras, cksR, itensR] = await Promise.all([
    baixarObras(supabase),
    supabase.from("checklists").select("*").eq("ativo", true),
    supabase.from("itens_checklist").select("*"),
  ]);
  if (cksR.error) throw cksR.error;
  if (itensR.error) throw itensR.error;

  const checklists = (cksR.data ?? []) as Checklist[];
  const itens = (itensR.data ?? []) as ItemChecklist[];

  // Kits de Obra (Marco E). Resiliente a DB pré-0018 (tabelas inexistentes).
  let kits: Kit[] = [];
  let kitChecklists: KitChecklist[] = [];
  const kitsR = await supabase.from("kits").select("*").eq("ativo", true);
  if (!kitsR.error) {
    kits = (kitsR.data ?? []) as Kit[];
    const kcR = await supabase.from("kit_checklists").select("*");
    if (!kcR.error) kitChecklists = (kcR.data ?? []) as KitChecklist[];
  }

  await db.transaction("rw", [db.obras, db.checklists, db.itens, db.kits, db.kit_checklists], async () => {
    await db.obras.clear();
    await db.obras.bulkPut(obras);
    await db.checklists.clear();
    await db.checklists.bulkPut(checklists);
    await db.itens.clear();
    await db.itens.bulkPut(itens);
    await db.kits.clear();
    await db.kits.bulkPut(kits);
    await db.kit_checklists.clear();
    await db.kit_checklists.bulkPut(kitChecklists);
  });

  return { obras: obras.length, checklists: checklists.length, itens: itens.length, kits: kits.length };
}
