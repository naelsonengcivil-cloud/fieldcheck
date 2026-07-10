import { describe, it, expect } from "vitest";
import type { LocalInspecao, LocalResposta, LocalEvento } from "@/lib/db";
import type { Checklist, ItemChecklist, NcTransicao } from "@/types/db";
import { indexarRespostas } from "@/lib/obraView";
import { montarDadosExport, type CachesExport } from "@/lib/exportacoes";

const ck: Checklist = {
  id: "ck1",
  empresa_id: null,
  codigo: "ST-01",
  area: "Segurança do Trabalho",
  referencia: "NR-01",
  nome: "Gerenciamento de Riscos",
  versao: 1,
  ativo: true,
};
const item: ItemChecklist = {
  id: "it1",
  checklist_id: "ck1",
  ordem: 1,
  texto: "APR disponível",
  criterio: null,
};

function insp(id: string): LocalInspecao {
  return {
    id,
    empresa_id: "e",
    obra_id: "o",
    checklist_id: "ck1",
    inspetor_id: "u1",
    frente: "Frente 1",
    contratada: null,
    iniciada_em: "2026-06-01T09:00:00Z",
    finalizada_em: "2026-06-01T09:30:00Z",
    lat: null,
    lng: null,
    status: "finalizada",
    origem_offline: false,
    arquivada: false,
    sync: "sincronizado",
  };
}
function resp(id: string, inspecao_id: string, resposta: "C" | "NC" | "NA"): LocalResposta {
  return {
    id,
    inspecao_id,
    item_id: "it1",
    resposta,
    observacao: resposta === "NC" ? "Desvio X" : null,
    criado_em: "2026-06-01T09:30:00Z",
    sync: "sincronizado",
  };
}

function caches(overrides: Partial<CachesExport> = {}): CachesExport {
  const evento: LocalEvento = {
    id: "ev1",
    resposta_id: "r-nc",
    empresa_id: "e",
    obra_id: "o",
    responsavel: "Fulano",
    prazo: "2026-06-15",
    status: "aberto",
    tratamento: null,
    updated_at: "2026-06-01T09:30:00Z",
    sync: "sincronizado",
  };
  return {
    ckMap: new Map([[ck.id, ck]]),
    usrMap: new Map([["u1", "Ana"]]),
    itemMap: new Map([[item.id, item]]),
    eventoMap: new Map([["r-nc", evento]]),
    respComFoto: new Set(["r-nc"]),
    obraNome: "Obra A",
    ...overrides,
  };
}

describe("montarDadosExport", () => {
  it("monta a aba Inspeções com contagens e % conformidade", () => {
    const inspecoes = [insp("i1")];
    const idx = indexarRespostas([
      resp("r1", "i1", "C"),
      resp("r2", "i1", "C"),
      resp("r3", "i1", "NC"),
      resp("r4", "i1", "NA"),
    ]);
    const { inspecoes: linhas } = montarDadosExport(inspecoes, idx, caches());
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      Data: "01/06/2026",
      Checklist: "ST-01",
      Inspetor: "Ana",
      Conformes: 2,
      "Não Conformes": 1,
      "N/A": 1,
      "% Conformidade": "67%", // 2/(2+1)
      Obra: "Frente 1",
    });
  });

  it("monta a aba Eventos só com as NCs, com responsável/prazo/foto", () => {
    const inspecoes = [insp("i1")];
    const idx = indexarRespostas([resp("r-nc", "i1", "NC"), resp("r-ok", "i1", "C")]);
    const { eventos } = montarDadosExport(inspecoes, idx, caches());
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({
      Item: "APR disponível",
      "Observação": "Desvio X",
      "Responsável": "Fulano",
      Prazo: "15/06/2026",
      "Evidência Foto": "Sim",
    });
  });

  it("inclui o ciclo de NC: situação, tratamento, reaberturas, aprovada em, contratada", () => {
    const inspecoes = [insp("i1")];
    const idx = indexarRespostas([resp("r-nc", "i1", "NC")]);
    const evento: LocalEvento = {
      id: "ev1", resposta_id: "r-nc", empresa_id: "e", obra_id: "o",
      responsavel: "Fulano", prazo: "2026-06-15", status: "aprovada",
      tratamento: "Item corrigido conforme projeto", contratada_id: "cx",
      updated_at: "2026-06-10T00:00:00Z", sync: "sincronizado",
    };
    const tr = (para: NcTransicao["para_status"], dia: string): NcTransicao => ({
      id: `${para}-${dia}`, evento_id: "ev1", empresa_id: "e", de_status: null,
      para_status: para, ator_id: null, ator_nome: "X", comentario: null,
      criado_em: `2026-06-${dia}T00:00:00Z`,
    });
    const { eventos } = montarDadosExport(inspecoes, idx, caches({
      eventoMap: new Map([["r-nc", evento]]),
      transicoesPorEvento: new Map([["ev1", [
        tr("tratada", "05"), tr("reaberta", "06"), tr("tratada", "08"), tr("aprovada", "10"),
      ]]]),
      contratadaMap: new Map([["cx", "Montadora X"]]),
    }));
    expect(eventos[0]).toMatchObject({
      "Situação": "Aprovada",
      Tratamento: "Item corrigido conforme projeto",
      Reaberturas: 1,
      "Aprovada em": "10/06/2026",
      Contratada: "Montadora X",
    });
  });

  it("inclui criticidade e marca NC vencida (Marco I6)", () => {
    const inspecoes = [insp("i1")];
    const idx = indexarRespostas([resp("r-nc", "i1", "NC")]);
    const evento: LocalEvento = {
      id: "ev1", resposta_id: "r-nc", empresa_id: "e", obra_id: "o",
      responsavel: "Fulano", prazo: "2020-01-01", criticidade: "critica", status: "aberto",
      tratamento: null, updated_at: "2026-06-10T00:00:00Z", sync: "sincronizado",
    };
    const { eventos } = montarDadosExport(inspecoes, idx, caches({
      eventoMap: new Map([["r-nc", evento]]),
    }));
    expect(eventos[0]).toMatchObject({ Criticidade: "Crítica", Vencida: "Sim" });
  });

  it("reflete o filtro: conjunto vazio → sem linhas (aceite #4)", () => {
    const { inspecoes, eventos } = montarDadosExport([], new Map(), caches());
    expect(inspecoes).toHaveLength(0);
    expect(eventos).toHaveLength(0);
  });
});
