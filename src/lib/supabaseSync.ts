import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SyncClient,
  RemoteInspecao,
  RemoteResposta,
  RemoteEvento,
  RemoteEvidencia,
  RemoteOcorrencia,
} from "@/lib/sync";

// ============================================================
// Implementação do SyncClient sobre o Supabase (produção).
// Path de foto: {empresa_id}/{evidencia_id}.jpg — a 1ª pasta = empresa_id
// é exigida pelo RLS de storage (migration 0004).
// ============================================================

export function criarSupabaseSyncClient(
  supabase: SupabaseClient,
  empresaId: string,
): SyncClient {
  const falhar = (contexto: string, error: unknown) => {
    throw new Error(`sync ${contexto}: ${(error as Error)?.message ?? error}`);
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
      const { error } = await supabase.storage
        .from("evidencias")
        .upload(path, blob, {
          contentType: "image/jpeg",
          upsert: true, // idempotente: retry sobrescreve o mesmo caminho
        });
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
