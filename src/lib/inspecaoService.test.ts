import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FieldCheckDB } from "@/lib/db";
import type { Obra, Checklist, ItemChecklist } from "@/types/db";
import {
  criarExecucao,
  avaliarExecucao,
  salvarInspecaoLocal,
  type ExecInspecao,
} from "@/lib/inspecaoService";

const obra: Obra = {
  id: "obra-1",
  empresa_id: "emp-1",
  nome: "UFV Diamantina I",
  cliente: null,
  status: "em_andamento",
  ativa: true,
};
const checklist: Checklist = {
  id: "ck-1",
  empresa_id: null,
  codigo: "MA-01", // não-ST: teste genérico não exige classificação (Bird)
  area: "Meio Ambiente",
  referencia: "—",
  nome: "Gerenciamento de Riscos",
  versao: 1,
  ativo: true,
};
const itens: ItemChecklist[] = [
  { id: "it-1", checklist_id: "ck-1", ordem: 2, texto: "Item B", criterio: null },
  { id: "it-2", checklist_id: "ck-1", ordem: 1, texto: "Item A", criterio: "crit" },
  { id: "it-3", checklist_id: "ck-1", ordem: 3, texto: "Item C", criterio: null },
];

let contador = 0;
let db: FieldCheckDB;
beforeEach(async () => {
  db = new FieldCheckDB(`test-insp-${contador++}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

function novaExec(): ExecInspecao {
  return criarExecucao(
    obra,
    checklist,
    itens,
    { frente: "Frente 1", contratada: "Contratada X" },
    "2026-07-02T10:00:00Z",
  );
}
const ctx = {
  empresaId: "emp-1",
  inspetorId: "user-1",
  finalizadaEm: "2026-07-02T10:20:00Z",
};

describe("criarExecucao", () => {
  it("ordena os itens por ordem e zera as respostas", () => {
    const exec = novaExec();
    expect(exec.itens.map((i) => i.item_id)).toEqual(["it-2", "it-1", "it-3"]);
    expect(exec.itens.every((i) => i.resposta === "")).toBe(true);
  });
});

describe("salvarInspecaoLocal — regra de finalização (aceite #2)", () => {
  it("recusa salvar com itens não respondidos", async () => {
    const exec = novaExec();
    exec.itens[0].resposta = "C"; // só 1 de 3
    await expect(salvarInspecaoLocal(db, exec, ctx)).rejects.toThrow();
    expect(await db.inspecoes.count()).toBe(0);
  });

  it("recusa salvar com NC sem observação", async () => {
    const exec = novaExec();
    exec.itens[0].resposta = "C";
    exec.itens[1].resposta = "NC"; // sem observação
    exec.itens[2].resposta = "NA";
    expect(avaliarExecucao(exec).ok).toBe(false);
    await expect(salvarInspecaoLocal(db, exec, ctx)).rejects.toThrow();
    expect(await db.inspecoes.count()).toBe(0);
  });
});

describe("salvarInspecaoLocal — grava offline no IndexedDB", () => {
  it("persiste inspeção + respostas + evento (NC) + evidência (foto), tudo pendente", async () => {
    const exec = novaExec();
    // it-2 (ordem 1) Conforme; it-1 (ordem 2) NC com obs+foto; it-3 (ordem 3) NA
    exec.itens[0].resposta = "C";
    exec.itens[1].resposta = "NC";
    exec.itens[1].observacao = "Cabo exposto";
    exec.itens[1].responsavel = "Fulano";
    exec.itens[1].criticidade = "alta";
    exec.itens[1].prazo = "2026-07-10";
    exec.itens[1].fotoBlob = new Blob(["x"], { type: "image/jpeg" });
    exec.itens[2].resposta = "NA";

    const id = await salvarInspecaoLocal(db, exec, ctx);

    const insp = await db.inspecoes.get(id);
    expect(insp?.status).toBe("finalizada");
    expect(insp?.sync).toBe("pendente");
    expect(insp?.origem_offline).toBe(true);
    expect(insp?.frente).toBe("Frente 1");

    expect(await db.respostas.where("inspecao_id").equals(id).count()).toBe(3);

    const eventos = await db.eventos.toArray();
    expect(eventos).toHaveLength(1);
    expect(eventos[0].responsavel).toBe("Fulano");
    expect(eventos[0].prazo).toBe("2026-07-10");
    expect(eventos[0].criticidade).toBe("alta");
    expect(eventos[0].status).toBe("aberto");
    expect(eventos[0].sync).toBe("pendente");

    const evidencias = await db.evidencias.toArray();
    expect(evidencias).toHaveLength(1);
    expect(evidencias[0].tipo).toBe("abertura");
    expect(evidencias[0].blob).toBeInstanceOf(Blob);
    expect(evidencias[0].sync).toBe("pendente");

    // o evento aponta para a resposta NC correta
    const respNC = (await db.respostas.toArray()).find((r) => r.resposta === "NC");
    expect(eventos[0].resposta_id).toBe(respNC?.id);
    expect(evidencias[0].resposta_id).toBe(respNC?.id);
  });

  it("sem NCs: nenhum evento; sem fotos: nenhuma evidência", async () => {
    const exec = novaExec();
    exec.itens.forEach((i) => (i.resposta = "C"));
    const id = await salvarInspecaoLocal(db, exec, ctx);
    expect(await db.inspecoes.get(id)).toBeTruthy();
    expect(await db.eventos.count()).toBe(0);
    expect(await db.evidencias.count()).toBe(0);
    expect(await db.respostas.count()).toBe(3);
  });
});
