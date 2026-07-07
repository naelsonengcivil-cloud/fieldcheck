import { supabase } from "@/lib/supabase";
import { db } from "@/lib/db";

// ============================================================
// Notificações do ciclo de NC (N1) — ações de I/O. Espelho do servidor
// no Dexie; o estado "lida" é marcado via update (RLS: só as próprias)
// e refletido localmente. Parte pura fica em notificacoesView.ts.
// ============================================================

/** Marca uma notificação como lida (servidor + cache). Idempotente. */
export async function marcarLida(id: string): Promise<void> {
  const agora = new Date().toISOString();
  await supabase.from("notificacoes").update({ lida_em: agora }).eq("id", id).is("lida_em", null);
  await db.notificacoes.update(id, { lida_em: agora });
}

/** Marca todas as não lidas do usuário como lidas. */
export async function marcarTodasLidas(): Promise<void> {
  const agora = new Date().toISOString();
  const naoLidas = await db.notificacoes.filter((n) => !n.lida_em).toArray();
  if (naoLidas.length === 0) return;
  // RLS limita o update às próprias linhas; filtra as não lidas.
  await supabase.from("notificacoes").update({ lida_em: agora }).is("lida_em", null);
  await db.notificacoes.bulkPut(naoLidas.map((n) => ({ ...n, lida_em: agora })));
}
