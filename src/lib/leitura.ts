import type { SupabaseClient } from "@supabase/supabase-js";
import type { Table } from "dexie";
import type {
  FieldCheckDB,
  LocalInspecao,
  LocalResposta,
  LocalEvento,
  LocalEvidencia,
  SyncStatus,
} from "@/lib/db";
import type { Usuario, NcTransicao } from "@/types/db";

// ============================================================
// Baixa o "modelo de leitura" da empresa (inspeções finalizadas +
// respostas + eventos + usuários) do Supabase para o Dexie, marcando
// tudo como 'sincronizado'. Assim Home/Obra/Detalhe (M6) leem do Dexie
// e funcionam offline, mostrando inspeções de TODOS os inspetores.
//
// Usa bulkPut (NÃO clear): preserva inspeções locais 'pendente' que
// ainda não subiram. O RLS já filtra tudo por empresa. Depois do espelho,
// PODA as linhas 'sincronizado' que sumiram do servidor (ex.: inspeção/NC
// excluída por um admin em outro dispositivo), preservando 'pendente'/'erro'.
// ============================================================

export interface ResumoLeitura {
  inspecoes: number;
  respostas: number;
  eventos: number;
  usuarios: number;
  evidencias: number;
  transicoes: number;
  podadas: number; // linhas locais removidas por não existirem mais no servidor
}

/**
 * Remove da tabela local as linhas 'sincronizado' cujo id não veio mais do
 * servidor (foram excluídas lá). Preserva 'pendente'/'erro' (ainda não subiram).
 */
async function podar<T extends { id: string; sync: SyncStatus }>(
  tabela: Table<T, string>,
  idsServidor: Set<string>,
): Promise<number> {
  const locais = await tabela.toArray();
  const remover = locais
    .filter((x) => x.sync === "sincronizado" && !idsServidor.has(x.id))
    .map((x) => x.id);
  if (remover.length) await tabela.bulkDelete(remover);
  return remover.length;
}

export async function baixarLeitura(
  db: FieldCheckDB,
  supabase: SupabaseClient,
): Promise<ResumoLeitura> {
  const [inspR, respR, evtR, usrR, eviR] = await Promise.all([
    supabase.from("inspecoes").select("*").eq("status", "finalizada"),
    supabase.from("respostas").select("*"),
    supabase.from("eventos_nc").select("*"),
    supabase.from("usuarios").select("id, empresa_id, nome, papel, ativo"),
    supabase.from("evidencias").select("*"),
  ]);
  if (inspR.error) throw inspR.error;
  if (respR.error) throw respR.error;
  if (evtR.error) throw evtR.error;
  if (usrR.error) throw usrR.error;
  if (eviR.error) throw eviR.error;

  // Histórico do ciclo de NC (Marco B1). Resiliente: se a migration 0012
  // ainda não foi aplicada, a tabela não existe — tratamos como vazio.
  let transicoes: NcTransicao[] = [];
  const trR = await supabase
    .from("nc_transicoes")
    .select("*")
    .order("criado_em", { ascending: true });
  if (!trR.error) transicoes = (trR.data ?? []) as NcTransicao[];

  const inspecoes: LocalInspecao[] = (inspR.data ?? []).map((i) => ({
    ...(i as Omit<LocalInspecao, "sync">),
    arquivada: (i as { arquivada?: boolean }).arquivada ?? false,
    sync: "sincronizado",
  }));
  const respostas: LocalResposta[] = (respR.data ?? []).map((r) => ({
    ...(r as Omit<LocalResposta, "sync">),
    sync: "sincronizado",
  }));
  const eventos: LocalEvento[] = (evtR.data ?? []).map((e) => ({
    ...(e as Omit<LocalEvento, "sync">),
    sync: "sincronizado",
  }));
  const usuarios = (usrR.data ?? []) as Usuario[];
  // Evidências do servidor: metadados com url (path). blob fica nulo — a foto
  // é exibida via signed URL sob demanda no detalhe.
  const evidencias: LocalEvidencia[] = (eviR.data ?? []).map((e) => ({
    ...(e as Omit<LocalEvidencia, "sync" | "blob" | "tentativas" | "proxima_tentativa">),
    blob: null,
    sync: "sincronizado",
    tentativas: 0,
    proxima_tentativa: 0,
  }));

  let podadas = 0;
  await db.transaction(
    "rw",
    [db.inspecoes, db.respostas, db.eventos, db.usuarios, db.evidencias, db.nc_transicoes],
    async () => {
      await db.inspecoes.bulkPut(inspecoes);
      await db.respostas.bulkPut(respostas);
      await db.eventos.bulkPut(eventos);
      await db.usuarios.clear();
      await db.usuarios.bulkPut(usuarios);
      // Espelha o histórico do servidor (fonte da verdade do ciclo).
      await db.nc_transicoes.clear();
      await db.nc_transicoes.bulkPut(transicoes);
      // Só grava evidências ainda inexistentes localmente, para não sobrescrever
      // uma evidência pendente (que ainda tem o blob) por metadados sem blob.
      for (const ev of evidencias) {
        const existente = await db.evidencias.get(ev.id);
        if (!existente) await db.evidencias.put(ev);
      }
      // Poda o que foi excluído no servidor (mantém pendentes/erros locais).
      // usuarios e nc_transicoes já são espelho total via clear()+bulkPut.
      podadas =
        (await podar(db.inspecoes, new Set(inspecoes.map((i) => i.id)))) +
        (await podar(db.respostas, new Set(respostas.map((r) => r.id)))) +
        (await podar(db.eventos, new Set(eventos.map((e) => e.id)))) +
        (await podar(db.evidencias, new Set(evidencias.map((e) => e.id))));
    },
  );

  return {
    inspecoes: inspecoes.length,
    respostas: respostas.length,
    eventos: eventos.length,
    usuarios: usuarios.length,
    evidencias: evidencias.length,
    transicoes: transicoes.length,
    podadas,
  };
}
