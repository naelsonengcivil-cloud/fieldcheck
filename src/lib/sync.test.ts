import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FieldCheckDB } from "@/lib/db";
import type {
  LocalInspecao,
  LocalResposta,
  LocalEvento,
  LocalEvidencia,
} from "@/lib/db";
import {
  sincronizar,
  backoffMs,
  contarPendencias,
  tentarItem,
  type SyncClient,
} from "@/lib/sync";

// ---------- fake SyncClient em memória ----------
interface FakeOpts {
  falharInspecao?: boolean; // erro transitório (sem código/status)
  erroInspecao?: { codigo?: string; status?: number }; // erro específico
  falharUploadAte?: number; // falha as N primeiras tentativas de upload
}
function fakeClient(opts: FakeOpts = {}) {
  const chamadas: string[] = [];
  const remoto = {
    inspecoes: new Map<string, unknown>(),
    respostas: new Map<string, unknown>(),
    eventos: new Map<string, unknown>(),
    evidencias: new Map<string, unknown>(),
    fotos: new Map<string, Blob>(),
  };
  let uploads = 0;
  const client: SyncClient = {
    async upsertInspecao(row) {
      if (opts.falharInspecao) throw new Error("rede");
      if (opts.erroInspecao) throw Object.assign(new Error("falha"), opts.erroInspecao);
      chamadas.push(`inspecao:${row.id}`);
      remoto.inspecoes.set(row.id, row);
    },
    async upsertResposta(row) {
      chamadas.push(`resposta:${row.id}`);
      remoto.respostas.set(row.id, row);
    },
    async upsertEvento(row) {
      chamadas.push(`evento:${row.id}`);
      remoto.eventos.set(row.id, row);
    },
    async upsertOcorrencia(row) {
      chamadas.push(`ocorrencia:${row.id}`);
    },
    async uploadFoto(id, blob) {
      uploads++;
      if (opts.falharUploadAte && uploads <= opts.falharUploadAte) {
        throw new Error("upload falhou");
      }
      chamadas.push(`foto:${id}`);
      remoto.fotos.set(id, blob);
      return `emp/${id}.jpg`;
    },
    async insertEvidencia(row) {
      chamadas.push(`evidencia:${row.id}`);
      remoto.evidencias.set(row.id, row);
    },
  };
  return { client, chamadas, remoto };
}

// ---------- fábricas de registros locais ----------
const inspecao = (id: string): LocalInspecao => ({
  id,
  empresa_id: "emp",
  obra_id: "obra",
  checklist_id: "ck",
  inspetor_id: "user",
  frente: null,
  contratada: null,
  iniciada_em: "2026-07-02T10:00:00Z",
  finalizada_em: "2026-07-02T10:20:00Z",
  data_inspecao: "2026-07-02T10:20:00Z",
  registrado_em: null,
  lat: null,
  lng: null,
  status: "finalizada",
  origem_offline: true,
  arquivada: false,
  sync: "pendente",
});
const resposta = (id: string, inspecao_id: string): LocalResposta => ({
  id,
  inspecao_id,
  item_id: "item",
  resposta: "NC",
  observacao: "desvio",
  criado_em: "2026-07-02T10:05:00Z",
  sync: "pendente",
});
const evento = (id: string, resposta_id: string): LocalEvento => ({
  id,
  resposta_id,
  empresa_id: "emp",
  obra_id: "obra",
  responsavel: null,
  prazo: null,
  status: "aberto",
  tratamento: null,
  updated_at: "2026-07-02T10:05:00Z",
  sync: "pendente",
});
const evidencia = (id: string, resposta_id: string): LocalEvidencia => ({
  id,
  resposta_id,
  evento_id: null,
  tipo: "abertura",
  blob: new Blob(["foto"], { type: "image/jpeg" }),
  url: null,
  lat: null,
  lng: null,
  capturada_em: "2026-07-02T10:05:00Z",
  sync: "pendente",
  tentativas: 0,
  proxima_tentativa: 0,
});

let contador = 0;
let db: FieldCheckDB;
beforeEach(async () => {
  db = new FieldCheckDB(`test-${contador++}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

async function semear() {
  await db.inspecoes.add(inspecao("I1"));
  await db.respostas.add(resposta("R1", "I1"));
  await db.eventos.add(evento("E1", "R1"));
  await db.evidencias.add(evidencia("EV1", "R1"));
}

describe("sincronizar — ordem de envio (§7.2)", () => {
  it("envia inspeção → resposta → evento → foto, nessa ordem", async () => {
    await semear();
    const { client, chamadas } = fakeClient();
    const res = await sincronizar(db, client, 1_000);

    expect(res).toMatchObject({ inspecoes: 1, respostas: 1, eventos: 1, fotos: 1 });
    const iIns = chamadas.indexOf("inspecao:I1");
    const iResp = chamadas.indexOf("resposta:R1");
    const iEv = chamadas.indexOf("evento:E1");
    const iFoto = chamadas.indexOf("foto:EV1");
    expect(iIns).toBeGreaterThanOrEqual(0);
    expect(iIns).toBeLessThan(iResp);
    expect(iResp).toBeLessThan(iEv);
    expect(iEv).toBeLessThan(iFoto);
  });
});

describe("sincronizar — idempotência (§7.3)", () => {
  it("não reenvia o que já está sincronizado e não duplica no remoto", async () => {
    await semear();
    const { client, chamadas, remoto } = fakeClient();

    await sincronizar(db, client, 1_000);
    const apos1 = chamadas.length;
    // segunda passada: nada pendente
    const res2 = await sincronizar(db, client, 2_000);

    expect(chamadas.length).toBe(apos1); // nenhuma chamada nova
    expect(res2).toMatchObject({ inspecoes: 0, respostas: 0, eventos: 0, fotos: 0 });
    expect(remoto.inspecoes.size).toBe(1);
    expect(remoto.respostas.size).toBe(1);
    expect(remoto.eventos.size).toBe(1);
    expect(remoto.evidencias.size).toBe(1);
    expect(await contarPendencias(db)).toBe(0);
  });
});

describe("sincronizar — dependências de FK", () => {
  it("não envia a resposta se a inspeção pai falhou (erro permanente)", async () => {
    await semear();
    const { client, chamadas } = fakeClient({ erroInspecao: { codigo: "23503" } });
    const res = await sincronizar(db, client, 1_000);

    expect(res.erros).toBeGreaterThanOrEqual(1);
    expect(chamadas).not.toContain("resposta:R1");
    expect(chamadas).not.toContain("evento:E1");
    expect((await db.inspecoes.get("I1"))?.sync).toBe("erro"); // permanente
    expect((await db.respostas.get("R1"))?.sync).toBe("pendente");
  });
});

describe("sincronizar — foto não bloqueia e faz backoff (§7.4)", () => {
  it("mantém a foto pendente com backoff enquanto sobe o restante", async () => {
    await semear();
    const { client, chamadas } = fakeClient({ falharUploadAte: 1 });
    const T = 1_000;
    const res = await sincronizar(db, client, T);

    // inspeção/resposta/evento sobem; foto é adiada
    expect(res).toMatchObject({ inspecoes: 1, respostas: 1, eventos: 1, fotos: 0, adiadas: 1 });
    expect(chamadas).not.toContain("foto:EV1");

    const ev = await db.evidencias.get("EV1");
    expect(ev?.sync).toBe("pendente");
    expect(ev?.tentativas).toBe(1);
    expect(ev?.proxima_tentativa).toBe(T + backoffMs(1));
    expect(ev?.blob).toBeInstanceOf(Blob); // ainda guardada p/ retry

    // ainda dentro da janela de backoff: não tenta de novo
    const resCedo = await sincronizar(db, client, T + backoffMs(1) - 1);
    expect(resCedo.adiadas).toBe(1);
    expect(resCedo.fotos).toBe(0);

    // passada a janela: sobe com sucesso e libera o blob
    const resDepois = await sincronizar(db, client, T + backoffMs(1));
    expect(resDepois.fotos).toBe(1);
    const ev2 = await db.evidencias.get("EV1");
    expect(ev2?.sync).toBe("sincronizado");
    expect(ev2?.url).toBe("emp/EV1.jpg");
    expect(ev2?.blob).toBeNull();
  });
});

describe("sincronizar — transitório × permanente (Entrega C)", () => {
  it("falha transitória vira 'pendente' com backoff; reenvia após a janela", async () => {
    await db.inspecoes.add(inspecao("I1"));
    const { client: falho } = fakeClient({ falharInspecao: true });
    await sincronizar(db, falho, 1_000);
    const apos = await db.inspecoes.get("I1");
    expect(apos?.sync).toBe("pendente"); // transitório NÃO vira erro
    expect(apos?.tentativas).toBe(1);
    expect(apos?.proxima_tentativa).toBe(1_000 + backoffMs(1));
    expect(apos?.ultimo_erro).toContain("rede");

    // Dentro da janela de backoff → não reenvia.
    const { client: ok, chamadas } = fakeClient();
    await sincronizar(db, ok, 1_500);
    expect(chamadas).not.toContain("inspecao:I1");

    // Passada a janela → reenvia e sincroniza.
    await sincronizar(db, ok, 9_999_999);
    expect((await db.inspecoes.get("I1"))?.sync).toBe("sincronizado");
  });

  it("erro permanente (código PG) vai para 'erro' e NÃO é reenviado automaticamente", async () => {
    await db.inspecoes.add(inspecao("I1"));
    const { client: pg } = fakeClient({ erroInspecao: { codigo: "23514", status: 400 } });
    await sincronizar(db, pg, 1_000);
    const apos = await db.inspecoes.get("I1");
    expect(apos?.sync).toBe("erro");
    expect(apos?.ultimo_erro).toContain("23514");
    expect(apos?.ultimo_status_http).toBe(400);

    // Nova passada (sem backoff, mas status 'erro' não entra na fila 'pendente').
    const { client: ok, chamadas } = fakeClient();
    await sincronizar(db, ok, 9_999_999);
    expect(chamadas).not.toContain("inspecao:I1");
    expect((await db.inspecoes.get("I1"))?.sync).toBe("erro"); // aguarda ação do usuário
  });

  it("tentarItem reenfileira um erro permanente para nova tentativa", async () => {
    await db.inspecoes.add(inspecao("I1"));
    const { client: pg } = fakeClient({ erroInspecao: { codigo: "23514" } });
    await sincronizar(db, pg, 1_000);
    expect((await db.inspecoes.get("I1"))?.sync).toBe("erro");

    await tentarItem(db, "inspecoes", "I1");
    const { client: ok } = fakeClient();
    await sincronizar(db, ok, 2_000);
    expect((await db.inspecoes.get("I1"))?.sync).toBe("sincronizado");
  });
});

describe("sincronizar — self-heal de evidência órfã", () => {
  it("evidência em 'erro' sem binário e sem url é removida (não trava a fila)", async () => {
    await db.evidencias.add({ ...evidencia("EVX", "R1"), blob: null, url: null, sync: "erro" });
    const { client } = fakeClient();
    await sincronizar(db, client);
    expect(await db.evidencias.get("EVX")).toBeUndefined();
    expect(await contarPendencias(db)).toBe(0);
  });

  it("evidência sem binário mas já com url é concluída (estava no servidor)", async () => {
    await db.evidencias.add({ ...evidencia("EVY", "R1"), blob: null, url: "emp/EVY.jpg", sync: "erro" });
    const { client } = fakeClient();
    await sincronizar(db, client);
    expect((await db.evidencias.get("EVY"))?.sync).toBe("sincronizado");
  });
});

describe("backoffMs", () => {
  it("cresce exponencialmente e satura em 5min", () => {
    expect(backoffMs(1)).toBe(5_000);
    expect(backoffMs(2)).toBe(10_000);
    expect(backoffMs(3)).toBe(20_000);
    expect(backoffMs(10)).toBe(300_000);
    expect(backoffMs(50)).toBe(300_000);
  });
});
