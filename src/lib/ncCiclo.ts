import { supabase } from "@/lib/supabase";
import { db, type LocalEvento, type LocalEvidencia } from "@/lib/db";
import { uuid } from "@/lib/inspecaoService";
import { statusApos, type AcaoNc } from "@/lib/ncEstado";
import type { NcTransicao, StatusEvento } from "@/types/db";

// ============================================================
// Ações do ciclo de tratamento de NC (Marco B1) — chamam as RPCs
// (registrar_tratamento / aprovar_tratamento / reprovar_tratamento) e
// refletem o novo status + o histórico no cache local (Dexie), para o
// detalhe reagir na hora. O ciclo é online (fluxo fiscal↔executora de
// escritório); o servidor é a fonte da verdade e `baixarLeitura` reespelha.
// ============================================================

export interface Ator {
  id: string;
  nome: string;
}

function traduz(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("gestor") || m.includes("administrador")) return "Apenas gestor ou administrador pode aprovar/reprovar.";
  if (m.includes("descrição")) return "Descreva o tratamento aplicado.";
  if (m.includes("motivo")) return "Informe o motivo da reprovação.";
  if (m.includes("transição inválida")) return "Esta NC não está no estado esperado. Recarregue e tente de novo.";
  if (m.includes("não encontrada")) return "NC não encontrada.";
  return "Não foi possível concluir. Tente novamente.";
}

/** Reflete a transição no cache local: novo status + linha de histórico (otimista). */
async function aplicarLocal(
  evento: LocalEvento,
  acao: AcaoNc,
  comentario: string | null,
  ator: Ator,
  quando: string,
  extra?: Partial<LocalEvento>,
): Promise<void> {
  const novo: StatusEvento = statusApos(acao);
  const de: StatusEvento = evento.status;
  const transicao: NcTransicao = {
    id: uuid(),
    evento_id: evento.id,
    empresa_id: evento.empresa_id,
    de_status: de,
    para_status: novo,
    ator_id: ator.id,
    ator_nome: ator.nome,
    comentario: comentario,
    criado_em: quando,
  };
  await db.transaction("rw", db.eventos, db.nc_transicoes, async () => {
    await db.eventos.update(evento.id, { status: novo, updated_at: quando, ...extra });
    await db.nc_transicoes.put(transicao);
  });
}

/**
 * Executora registra o tratamento (descrição obrigatória + foto opcional):
 * aberto/reaberta → tratada. A foto (se houver) sobe ao Storage e vira uma
 * evidência tipo 'tratamento' ligada ao evento.
 */
export async function registrarTratamento(
  evento: LocalEvento,
  descricao: string,
  ator: Ator,
  fotoBlob?: Blob | null,
): Promise<{ error: string | null }> {
  // Foto primeiro (o evento já existe): assim o sucesso significa tudo pronto.
  let evidencia: LocalEvidencia | null = null;
  if (fotoBlob) {
    const id = uuid();
    const path = `${evento.empresa_id}/${id}.jpg`;
    const up = await supabase.storage
      .from("evidencias")
      .upload(path, fotoBlob, { contentType: "image/jpeg", upsert: true });
    if (up.error) return { error: "Falha ao enviar a foto. Tente novamente." };
    const ins = await supabase
      .from("evidencias")
      .insert({ id, evento_id: evento.id, resposta_id: null, tipo: "tratamento", url: path });
    if (ins.error) return { error: "Falha ao registrar a foto. Tente novamente." };
    evidencia = {
      id,
      resposta_id: null,
      evento_id: evento.id,
      tipo: "tratamento",
      blob: fotoBlob, // mantém p/ exibição imediata
      url: path,
      lat: null,
      lng: null,
      capturada_em: new Date().toISOString(),
      sync: "sincronizado",
      tentativas: 0,
      proxima_tentativa: 0,
    };
  }

  const { data, error } = await supabase.rpc("registrar_tratamento", {
    p_evento_id: evento.id,
    p_descricao: descricao,
  });
  if (error) return { error: traduz(error.message) };

  const quando = (data as string) ?? new Date().toISOString();
  if (evidencia) await db.evidencias.put(evidencia);
  await aplicarLocal(evento, "tratar", descricao, ator, quando, { tratamento: descricao.trim() });
  return { error: null };
}

/** Gestor/admin aprova o tratamento: tratada → aprovada (encerra a NC). */
export async function aprovarTratamento(
  evento: LocalEvento,
  ator: Ator,
  comentario?: string,
): Promise<{ error: string | null }> {
  const { data, error } = await supabase.rpc("aprovar_tratamento", {
    p_evento_id: evento.id,
    p_comentario: comentario?.trim() || null,
  });
  if (error) return { error: traduz(error.message) };
  const quando = (data as string) ?? new Date().toISOString();
  await aplicarLocal(evento, "aprovar", comentario?.trim() || null, ator, quando);
  return { error: null };
}

/** Gestor/admin reprova: tratada → reaberta (volta p/ a executora). Motivo obrigatório. */
export async function reprovarTratamento(
  evento: LocalEvento,
  ator: Ator,
  motivo: string,
): Promise<{ error: string | null }> {
  const { data, error } = await supabase.rpc("reprovar_tratamento", {
    p_evento_id: evento.id,
    p_motivo: motivo,
  });
  if (error) return { error: traduz(error.message) };
  const quando = (data as string) ?? new Date().toISOString();
  await aplicarLocal(evento, "reprovar", motivo.trim(), ator, quando);
  return { error: null };
}
