import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FieldCheckDB } from "@/lib/db";
import type { LocalInspecao, LocalResposta, SyncStatus } from "@/lib/db";
import { baixarLeitura } from "@/lib/leitura";
import type { SupabaseClient } from "@supabase/supabase-js";

// Fake mínimo do Supabase: cada from(tabela).select()/.eq()/.order() é um
// thenable que resolve { data, error } com os dados pré-definidos da tabela.
function fakeSupabase(dados: Record<string, unknown[]>): SupabaseClient {
  const make = (tabela: string) => {
    const result = { data: dados[tabela] ?? [], error: null };
    const q: Record<string, unknown> = {
      select: () => q,
      eq: () => q,
      is: () => q,
      order: () => q,
      then: (resolve: (v: typeof result) => void) => resolve(result),
    };
    return q;
  };
  return { from: (t: string) => make(t) } as unknown as SupabaseClient;
}

function insp(id: string, sync: SyncStatus): LocalInspecao {
  return {
    id,
    empresa_id: "e",
    obra_id: "o",
    checklist_id: "ck",
    inspetor_id: "u",
    frente: null,
    contratada: null,
    iniciada_em: "2026-07-01T10:00:00Z",
    finalizada_em: "2026-07-01T10:20:00Z",
    data_inspecao: null,
    registrado_em: null,
    lat: null,
    lng: null,
    status: "finalizada",
    origem_offline: false,
    arquivada: false,
    sync,
  };
}
function resp(id: string, sync: SyncStatus): LocalResposta {
  return {
    id,
    inspecao_id: "I1",
    item_id: "it",
    resposta: "C",
    observacao: null,
    criado_em: "2026-07-01T10:10:00Z",
    sync,
  };
}

let contador = 0;
let db: FieldCheckDB;
beforeEach(async () => {
  db = new FieldCheckDB(`leitura-${contador++}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

describe("baixarLeitura — poda de linhas removidas no servidor", () => {
  it("remove 'sincronizado' ausente do servidor e preserva 'pendente'", async () => {
    // Local: I1 sincronizado (segue no servidor), I2 sincronizado (excluído no
    // servidor → deve podar), I3 pendente (ainda não subiu → preservar).
    await db.inspecoes.bulkPut([insp("I1", "sincronizado"), insp("I2", "sincronizado"), insp("I3", "pendente")]);
    await db.respostas.bulkPut([resp("R2", "sincronizado"), resp("R3", "pendente")]);

    // Servidor só devolve I1 (as demais foram excluídas / ainda não existem lá).
    const supabase = fakeSupabase({
      inspecoes: [insp("I1", "sincronizado")],
      respostas: [],
      eventos_nc: [],
      usuarios: [],
      evidencias: [],
      nc_transicoes: [],
    });

    const res = await baixarLeitura(db, supabase);

    expect(await db.inspecoes.get("I1")).toBeDefined(); // no servidor → mantém
    expect(await db.inspecoes.get("I2")).toBeUndefined(); // excluída → podada
    expect(await db.inspecoes.get("I3")).toBeDefined(); // pendente → preservada
    expect(await db.respostas.get("R2")).toBeUndefined(); // sincronizada ausente → podada
    expect(await db.respostas.get("R3")).toBeDefined(); // pendente → preservada
    expect(res.podadas).toBe(2); // I2 + R2
  });
});
