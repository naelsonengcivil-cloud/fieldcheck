import { describe, it, expect, beforeEach } from "vitest";
import { db, type LocalOcorrencia } from "@/lib/db";
import { promoverDesvioLocal, CHECKLIST_DESVIO_CODIGO } from "@/lib/ocorrenciaService";

// ============================================================
// Promoção de desvio a NC (Marco M · Fase 3a) — cadeia inspeção→resposta→evento.
// ============================================================

const desvio = (over: Partial<LocalOcorrencia> = {}): LocalOcorrencia => ({
  id: "D1",
  empresa_id: "EMP",
  obra_id: "OBRA",
  contratada_id: "CT",
  tipo: "condicao_insegura",
  data: "2026-07-22",
  descricao: "Fiação exposta",
  criado_por: "USER",
  criado_em: "2026-07-22T10:00:00Z",
  criticidade: "alta",
  ocorrida_em: "2026-07-22T09:00:00Z",
  sync: "sincronizado",
  ...over,
});

const ctx = { empresaId: "EMP", criadoPor: "USER" };

beforeEach(async () => {
  await db.open();
  await Promise.all([
    db.checklists.clear(), db.itens.clear(), db.ocorrencias.clear(),
    db.inspecoes.clear(), db.respostas.clear(), db.eventos.clear(),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.checklists.put({ id: "CKD", codigo: CHECKLIST_DESVIO_CODIGO, area: "ST", nome: "Desvio", versao: 1, ativo: true } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.itens.put({ id: "ITD", checklist_id: "CKD", ordem: 1, texto: "Desvio registrado" } as any);
});

describe("promoverDesvioLocal", () => {
  it("cria inspeção sintética + resposta NC (sem classificação_st) + evento", async () => {
    await db.ocorrencias.put(desvio());
    const inspId = await promoverDesvioLocal((await db.ocorrencias.get("D1"))!, ctx, { alta: 3 } as Record<string, number>);

    const insp = await db.inspecoes.get(inspId);
    expect(insp?.origem_desvio_id).toBe("D1");
    expect(insp?.status).toBe("finalizada");
    expect(insp?.checklist_id).toBe("CKD");

    const resp = (await db.respostas.toArray())[0];
    expect(resp.resposta).toBe("NC");
    expect(resp.classificacao_st).toBeNull(); // não conta na base da Bird
    expect(resp.observacao).toBe("Fiação exposta");

    const ev = (await db.eventos.toArray())[0];
    expect(ev.criticidade).toBe("alta");
    expect(ev.status).toBe("aberto");
    expect(ev.contratada_id).toBe("CT");

    expect((await db.ocorrencias.get("D1"))?.promovida_inspecao_id).toBe(inspId);
  });

  it("recusa desvio ainda não sincronizado", async () => {
    await db.ocorrencias.put(desvio({ sync: "pendente" }));
    await expect(promoverDesvioLocal((await db.ocorrencias.get("D1"))!, ctx)).rejects.toThrow(/[Ss]incronize/);
  });

  it("recusa desvio já promovido", async () => {
    await db.ocorrencias.put(desvio({ promovida_inspecao_id: "INSP-X" }));
    await expect(promoverDesvioLocal((await db.ocorrencias.get("D1"))!, ctx)).rejects.toThrow(/já foi promovido/);
  });

  it("recusa promover uma ocorrência que não é desvio", async () => {
    await db.ocorrencias.put(desvio({ tipo: "dano_material" }));
    await expect(promoverDesvioLocal((await db.ocorrencias.get("D1"))!, ctx)).rejects.toThrow(/desvios/i);
  });
});
