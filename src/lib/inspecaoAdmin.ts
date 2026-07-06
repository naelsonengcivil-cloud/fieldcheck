import { supabase } from "@/lib/supabase";
import { db } from "@/lib/db";

// ============================================================
// Ações administrativas sobre inspeções (Marco A / M14) — chamam as
// RPCs (admin-only, com auditoria) e refletem no cache local (Dexie).
// ============================================================

function traduz(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("administrador")) return "Apenas administradores podem fazer isto.";
  if (m.includes("motivo")) return "O motivo é obrigatório.";
  if (m.includes("não encontrada")) return "Inspeção não encontrada.";
  return "Não foi possível concluir. Tente novamente.";
}

/** Remove a inspeção e seus filhos do cache local (após exclusão no servidor). */
async function limparCacheLocal(id: string): Promise<void> {
  const respostas = await db.respostas.where("inspecao_id").equals(id).toArray();
  const respIds = respostas.map((r) => r.id);
  await db.transaction("rw", db.inspecoes, db.respostas, db.eventos, db.evidencias, async () => {
    if (respIds.length) {
      await db.evidencias.where("resposta_id").anyOf(respIds).delete();
      await db.eventos.where("resposta_id").anyOf(respIds).delete();
    }
    await db.respostas.where("inspecao_id").equals(id).delete();
    await db.inspecoes.delete(id);
  });
}

export async function arquivarInspecao(id: string, motivo: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("arquivar_inspecao", { p_inspecao_id: id, p_motivo: motivo });
  if (error) return { error: traduz(error.message) };
  await db.inspecoes.update(id, { arquivada: true });
  return { error: null };
}

export async function desarquivarInspecao(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("desarquivar_inspecao", { p_inspecao_id: id });
  if (error) return { error: traduz(error.message) };
  await db.inspecoes.update(id, { arquivada: false });
  return { error: null };
}

export async function excluirInspecao(id: string, motivo: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("excluir_inspecao", { p_inspecao_id: id, p_motivo: motivo });
  if (error) return { error: traduz(error.message) };
  await limparCacheLocal(id);
  return { error: null };
}
