import type { SupabaseClient } from "@supabase/supabase-js";
import type { FieldCheckDB } from "@/lib/db";
import type { Obra, Checklist, ItemChecklist } from "@/types/db";

// ============================================================
// Baixa o catálogo de referência (obras + checklists + itens) do
// Supabase para o Dexie, permitindo abrir inspeções 100% offline (RF03).
// Best-effort: se estiver sem rede, mantém o cache anterior.
// ============================================================

export interface ResumoCatalogo {
  obras: number;
  checklists: number;
  itens: number;
}

export async function baixarCatalogo(
  db: FieldCheckDB,
  supabase: SupabaseClient,
): Promise<ResumoCatalogo> {
  const [obrasR, cksR, itensR] = await Promise.all([
    supabase.from("obras").select("*").eq("ativa", true),
    supabase.from("checklists").select("*").eq("ativo", true),
    supabase.from("itens_checklist").select("*"),
  ]);
  if (obrasR.error) throw obrasR.error;
  if (cksR.error) throw cksR.error;
  if (itensR.error) throw itensR.error;

  const obras = (obrasR.data ?? []) as Obra[];
  const checklists = (cksR.data ?? []) as Checklist[];
  const itens = (itensR.data ?? []) as ItemChecklist[];

  await db.transaction("rw", db.obras, db.checklists, db.itens, async () => {
    await db.obras.clear();
    await db.obras.bulkPut(obras);
    await db.checklists.clear();
    await db.checklists.bulkPut(checklists);
    await db.itens.clear();
    await db.itens.bulkPut(itens);
  });

  return { obras: obras.length, checklists: checklists.length, itens: itens.length };
}
