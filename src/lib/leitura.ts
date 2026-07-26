import type { SupabaseClient } from "@supabase/supabase-js";
import type { Table } from "dexie";
import type {
  FieldCheckDB,
  LocalInspecao,
  LocalResposta,
  LocalEvento,
  LocalEvidencia,
  LocalOcorrencia,
  SyncStatus,
} from "@/lib/db";
import type { Usuario, NcTransicao, Contratada, Notificacao } from "@/types/db";

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
  contratadas: number;
  notificacoes: number;
  ocorrencias: number;
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
    supabase.from("inspecoes").select("*").eq("status", "finalizada").is("excluido_em", null),
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

  // Contratadas (Marco B2). Resiliente a DB pré-0013 (tabela inexistente).
  let contratadas: Contratada[] = [];
  const ctR = await supabase.from("contratadas").select("*");
  if (!ctR.error) contratadas = (ctR.data ?? []) as Contratada[];

  // Notificações (N1) — só as do usuário (RLS). Resiliente a DB pré-0015.
  let notificacoes: Notificacao[] = [];
  const noR = await supabase
    .from("notificacoes")
    .select("*")
    .order("criado_em", { ascending: false });
  if (!noR.error) notificacoes = (noR.data ?? []) as Notificacao[];

  // Ocorrências (A2) — offline-syncable. Resiliente a DB pré-0017.
  let ocorrencias: LocalOcorrencia[] = [];
  const ocR = await supabase.from("ocorrencias").select("*").is("excluido_em", null);
  if (!ocR.error)
    ocorrencias = (ocR.data ?? []).map((o) => ({
      ...(o as Omit<LocalOcorrencia, "sync">),
      sync: "sincronizado",
    }));

  // DEFESA EM PROFUNDIDADE (soft delete, 0065): descartamos no CLIENTE qualquer
  // inspeção com `excluido_em` preenchido, além do filtro `.is("excluido_em",
  // null)` no read-down. Confiar só no filtro do servidor é frágil: se a query
  // regredir, a projeção mudar, ou surgir outro caminho de leitura, a inspeção
  // excluída voltaria ao Dexie e reapareceria na TelaObra/KPIs. Filtrando aqui,
  // o cache fica correto independentemente do servidor — e é este o caminho que
  // o teste exercita (o fake ignora `.is()`, simulando o filtro que não pegou).
  const inspecoes: LocalInspecao[] = (inspR.data ?? [])
    .filter((i) => !(i as { excluido_em?: string | null }).excluido_em)
    .map((i) => ({
      ...(i as Omit<LocalInspecao, "sync">),
      arquivada: (i as { arquivada?: boolean }).arquivada ?? false,
      sync: "sincronizado",
    }));
  // Inspeções vigentes (finalizadas e NÃO soft-deleted). Os filhos de uma
  // inspeção excluída (respostas/eventos) continuam existindo no servidor e
  // voltariam ao Dexie no bulkPut, fazendo a Pirâmide de Bird e os KPIs "planos"
  // (que leem respostas soltas) contarem uma inspeção excluída. Filtramos aqui:
  // só entram filhos de inspeção vigente. A `podar` abaixo remove do cache os
  // filhos (e as inspeções) que ficaram órfãos por exclusão.
  const vigentes = new Set(inspecoes.map((i) => i.id));
  const respostas: LocalResposta[] = (respR.data ?? [])
    .filter((r) => vigentes.has((r as LocalResposta).inspecao_id))
    .map((r) => ({
      ...(r as Omit<LocalResposta, "sync">),
      sync: "sincronizado",
    }));
  const respVigentes = new Set(respostas.map((r) => r.id));
  const eventos: LocalEvento[] = (evtR.data ?? [])
    .filter((e) => respVigentes.has((e as LocalEvento).resposta_id))
    .map((e) => ({
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
    [db.inspecoes, db.respostas, db.eventos, db.usuarios, db.evidencias, db.nc_transicoes, db.contratadas, db.notificacoes, db.ocorrencias],
    async () => {
      await db.inspecoes.bulkPut(inspecoes);
      await db.respostas.bulkPut(respostas);
      await db.eventos.bulkPut(eventos);
      await db.usuarios.clear();
      await db.usuarios.bulkPut(usuarios);
      // Espelha o histórico do servidor (fonte da verdade do ciclo).
      await db.nc_transicoes.clear();
      await db.nc_transicoes.bulkPut(transicoes);
      // Espelho total das contratadas (referência).
      await db.contratadas.clear();
      await db.contratadas.bulkPut(contratadas);
      // Espelho total das notificações do usuário (inclui estado de leitura).
      await db.notificacoes.clear();
      await db.notificacoes.bulkPut(notificacoes);
      // Ocorrências: bulkPut (não clear) para preservar pendentes locais.
      await db.ocorrencias.bulkPut(ocorrencias);
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
        (await podar(db.evidencias, new Set(evidencias.map((e) => e.id)))) +
        (await podar(db.ocorrencias, new Set(ocorrencias.map((o) => o.id))));
    },
  );

  return {
    inspecoes: inspecoes.length,
    respostas: respostas.length,
    eventos: eventos.length,
    usuarios: usuarios.length,
    evidencias: evidencias.length,
    transicoes: transicoes.length,
    contratadas: contratadas.length,
    notificacoes: notificacoes.length,
    ocorrencias: ocorrencias.length,
    podadas,
  };
}
