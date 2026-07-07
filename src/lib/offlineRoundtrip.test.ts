import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FieldCheckDB } from "@/lib/db";
import type { Obra, Checklist, ItemChecklist } from "@/types/db";
import { criarExecucao, salvarInspecaoLocal } from "@/lib/inspecaoService";
import { sincronizar, contarPendencias, type SyncClient } from "@/lib/sync";

// ============================================================
// Critério de aceite #1 (integração): o inspetor executa uma inspeção
// COMPLETA offline; ao "religar a rede", tudo sobe sozinho — inclusive
// a foto — na ordem correta. Hermético (fake-indexeddb + fake client).
// ============================================================

const obra: Obra = { id: "o1", empresa_id: "e1", nome: "UFV", cliente: null, status: "em_andamento", ativa: true };
const checklist: Checklist = {
  id: "ck1",
  empresa_id: null,
  codigo: "MA-01", // não-ST: roundtrip genérico não exige classificação (Bird)
  area: "Meio Ambiente",
  referencia: "—",
  nome: "Riscos",
  versao: 1,
  ativo: true,
};
const itens: ItemChecklist[] = [
  { id: "i1", checklist_id: "ck1", ordem: 1, texto: "Item 1", criterio: null },
  { id: "i2", checklist_id: "ck1", ordem: 2, texto: "Item 2", criterio: null },
];

function fakeClient() {
  const chamadas: string[] = [];
  const remoto = {
    inspecoes: new Set<string>(),
    respostas: new Set<string>(),
    eventos: new Set<string>(),
    evidencias: new Set<string>(),
    fotos: new Set<string>(),
  };
  const client: SyncClient = {
    async upsertInspecao(r) {
      chamadas.push("inspecao");
      remoto.inspecoes.add(r.id);
    },
    async upsertResposta(r) {
      chamadas.push("resposta");
      remoto.respostas.add(r.id);
    },
    async upsertEvento(r) {
      chamadas.push("evento");
      remoto.eventos.add(r.id);
    },
    async upsertOcorrencia(r) {
      chamadas.push("ocorrencia");
      void r;
    },
    async uploadFoto(id, blob) {
      chamadas.push("foto");
      remoto.fotos.add(id);
      return `e1/${id}.jpg#${blob.size}`;
    },
    async insertEvidencia(r) {
      chamadas.push("evidencia");
      remoto.evidencias.add(r.id);
    },
  };
  return { client, chamadas, remoto };
}

let contador = 0;
let db: FieldCheckDB;
beforeEach(async () => {
  db = new FieldCheckDB(`test-e2e-${contador++}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

describe("roundtrip offline → online (aceite #1)", () => {
  it("inspeção completa criada offline sobe inteira ao sincronizar", async () => {
    // 1) OFFLINE: executa e finaliza (1 Conforme, 1 NC com obs + foto)
    const exec = criarExecucao(obra, checklist, itens, { frente: "F1", contratada: "C" }, "2026-07-02T10:00:00Z");
    exec.itens[0].resposta = "C";
    exec.itens[1].resposta = "NC";
    exec.itens[1].observacao = "desvio";
    exec.itens[1].fotoBlob = new Blob(["JPEGDATA"], { type: "image/jpeg" });

    await salvarInspecaoLocal(db, exec, {
      empresaId: "e1",
      inspetorId: "u1",
      finalizadaEm: "2026-07-02T10:20:00Z",
    });

    // Persistiu localmente e está tudo PENDENTE (nada subiu ainda).
    expect(await db.inspecoes.count()).toBe(1);
    expect(await db.respostas.count()).toBe(2);
    expect(await db.eventos.count()).toBe(1);
    expect(await db.evidencias.count()).toBe(1);
    expect(await contarPendencias(db)).toBe(5); // 1 insp + 2 resp + 1 evento + 1 evidência

    // 2) RELIGA A REDE: sincroniza
    const { client, chamadas, remoto } = fakeClient();
    const res = await sincronizar(db, client, 1_000);

    // Tudo subiu, na ordem correta
    expect(res).toMatchObject({ inspecoes: 1, respostas: 2, eventos: 1, fotos: 1, erros: 0 });
    expect(chamadas.indexOf("inspecao")).toBeLessThan(chamadas.indexOf("resposta"));
    expect(chamadas.lastIndexOf("resposta")).toBeLessThan(chamadas.indexOf("evento"));
    expect(chamadas.indexOf("evento")).toBeLessThan(chamadas.indexOf("foto"));

    // Servidor recebeu tudo (inclusive a foto e a evidência)
    expect(remoto.inspecoes.size).toBe(1);
    expect(remoto.respostas.size).toBe(2);
    expect(remoto.eventos.size).toBe(1);
    expect(remoto.fotos.size).toBe(1);
    expect(remoto.evidencias.size).toBe(1);

    // Nada mais pendente; a foto local foi liberada após o upload
    expect(await contarPendencias(db)).toBe(0);
    const ev = (await db.evidencias.toArray())[0];
    expect(ev.sync).toBe("sincronizado");
    expect(ev.blob).toBeNull();
    expect(ev.url).toContain("e1/");
  });
});
