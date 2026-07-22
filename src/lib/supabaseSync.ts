import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SyncClient,
  RemoteInspecao,
  RemoteResposta,
  RemoteEvento,
  RemoteEvidencia,
  RemoteOcorrencia,
} from "@/lib/sync";
import { recomprimirMenor } from "@/lib/foto";

// ============================================================
// Implementação do SyncClient sobre o Supabase (produção).
// Path de foto: {empresa_id}/{evidencia_id}.jpg — a 1ª pasta = empresa_id
// é exigida pelo RLS de storage (migration 0004).
// ============================================================

export function criarSupabaseSyncClient(
  supabase: SupabaseClient,
  empresaId: string,
): SyncClient {
  // Preserva código do Postgres e status HTTP para o diagnóstico (Entrega C).
  const falhar = (contexto: string, error: unknown): never => {
    const e = error as { message?: string; code?: string; status?: number; statusCode?: number };
    const err = new Error(`sync ${contexto}: ${e?.message ?? error}`) as Error & { codigo?: string; status?: number };
    if (e?.code) err.codigo = e.code;
    const st = e?.status ?? e?.statusCode;
    if (typeof st === "number") err.status = st;
    throw err;
  };

  return {
    async upsertInspecao(row: RemoteInspecao) {
      const { error } = await supabase
        .from("inspecoes")
        .upsert(row, { onConflict: "id" });
      if (error) falhar("inspecao", error);
    },

    async upsertResposta(row: RemoteResposta) {
      const { error } = await supabase
        .from("respostas")
        .upsert(row, { onConflict: "id" });
      if (error) falhar("resposta", error);
    },

    async upsertEvento(row: RemoteEvento) {
      // updated_at é reescrito pelo trigger no servidor (LWW §7.3).
      const { error } = await supabase
        .from("eventos_nc")
        .upsert(row, { onConflict: "id" });
      if (error) falhar("evento", error);
    },

    async upsertOcorrencia(row: RemoteOcorrencia) {
      const { error } = await supabase
        .from("ocorrencias")
        .upsert(row, { onConflict: "id" });
      if (error) falhar("ocorrencia", error);
    },

    async uploadFoto(id: string, blob: Blob): Promise<string> {
      const path = `${empresaId}/${id}.jpg`;
      const subir = (b: Blob) =>
        supabase.storage.from("evidencias").upload(path, b, {
          contentType: "image/jpeg",
          upsert: true, // idempotente: retry sobrescreve o mesmo caminho
        });
      let { error } = await subir(blob);
      // 413 (arquivo grande demais): recomprime menor e tenta 1x (Frente 4.3).
      const st = (error as { status?: number; statusCode?: number } | null)?.status
        ?? (error as { statusCode?: number } | null)?.statusCode;
      if (error && st === 413) {
        try {
          const menor = await recomprimirMenor(blob);
          ({ error } = await subir(menor));
        } catch { /* recompressão falhou → mantém o erro original */ }
      }
      if (error) falhar("upload_foto", error);
      return path;
    },

    async insertEvidencia(row: RemoteEvidencia) {
      const { error } = await supabase
        .from("evidencias")
        .upsert(row, { onConflict: "id" });
      if (error) falhar("evidencia", error);
    },
  };
}
