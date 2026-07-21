import { db } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import type { TriagemIa } from "@/types/db";

// ============================================================
// Triagem por IA do desvio avulso (Marco M · M-2) — cliente da Edge
// Function `ia-triagem-desvio` (contrato K/L). Dois caminhos:
//   • ONLINE, antes de salvar: envia as fotos (base64, ≤3) + contexto e a
//     sugestão volta na hora para preencher o formulário (editável, com
//     selo "IA · revise").
//   • OFFLINE/agendado: o pedido entra em `triagem_pendentes` e roda após
//     a sincronização subir o desvio e as fotos; a Edge grava `triagem_ia`
//     na ocorrência para revisão posterior.
// A IA NUNCA bloqueia o registro: falhou/indisponível → fluxo manual.
// ============================================================

export const MAX_FOTOS_TRIAGEM = 3;

export interface ContextoTriagem {
  obra?: string | null;
  frente?: string | null;
  contratada?: string | null;
  descricao?: string | null;
}

/** Analisa fotos ainda locais (pré-salvamento, online). Retorna null se a IA falhar. */
export async function analisarFotos(
  fotos: Blob[],
  contexto: ContextoTriagem,
): Promise<TriagemIa | null> {
  try {
    const fotos_base64 = await Promise.all(
      fotos.slice(0, MAX_FOTOS_TRIAGEM).map((b) => blobParaBase64(b)),
    );
    const { data, error } = await supabase.functions.invoke("ia-triagem-desvio", {
      body: { fotos_base64, contexto },
    });
    if (error) return null;
    const resp = data as { triagem?: TriagemIa; error?: string };
    return resp?.triagem ?? null;
  } catch {
    return null;
  }
}

/** Agenda a triagem de um desvio já salvo (roda após a sincronização). */
export async function enfileirarTriagem(ocorrenciaId: string): Promise<void> {
  await db.triagem_pendentes.put({
    ocorrencia_id: ocorrenciaId,
    criado_em: new Date().toISOString(),
    tentativas: 0,
  });
}

const MAX_TENTATIVAS = 5;

/**
 * Processa a fila de triagens pendentes. Só analisa desvios cuja ocorrência
 * e fotos já subiram (a Edge lê as fotos do Storage). @returns nº concluídas.
 */
export async function processarTriagensPendentes(): Promise<number> {
  if (!navigator.onLine) return 0;
  const fila = await db.triagem_pendentes.toArray();
  let ok = 0;
  for (const p of fila) {
    const oc = await db.ocorrencias.get(p.ocorrencia_id);
    if (!oc) {
      await db.triagem_pendentes.delete(p.ocorrencia_id);
      continue;
    }
    if (oc.triagem_ia) {
      // Já analisada (ex.: outra sessão) — só drena a fila.
      await db.triagem_pendentes.delete(p.ocorrencia_id);
      ok++;
      continue;
    }
    // Aguarda o desvio e TODAS as fotos dele subirem (a Edge lê do Storage).
    if (oc.sync !== "sincronizado") continue;
    const fotosPendentes = await db.evidencias
      .where("ocorrencia_id")
      .equals(p.ocorrencia_id)
      .filter((e) => e.sync !== "sincronizado")
      .count();
    if (fotosPendentes > 0) continue;

    try {
      const { data, error } = await supabase.functions.invoke("ia-triagem-desvio", {
        body: { ocorrencia_id: p.ocorrencia_id },
      });
      const resp = data as { triagem?: TriagemIa; error?: string };
      if (!error && resp?.triagem) {
        await db.ocorrencias.update(p.ocorrencia_id, {
          triagem_ia: resp.triagem,
          triagem_em: new Date().toISOString(),
        });
        await db.triagem_pendentes.delete(p.ocorrencia_id);
        ok++;
      } else {
        await marcarTentativa(p.ocorrencia_id, p.tentativas ?? 0);
      }
    } catch {
      await marcarTentativa(p.ocorrencia_id, p.tentativas ?? 0);
    }
  }
  return ok;
}

async function marcarTentativa(ocorrenciaId: string, tentativas: number) {
  if (tentativas + 1 >= MAX_TENTATIVAS) {
    // Desiste em silêncio: a IA é opcional e nunca bloqueia o fluxo manual.
    await db.triagem_pendentes.delete(ocorrenciaId);
  } else {
    await db.triagem_pendentes.update(ocorrenciaId, { tentativas: tentativas + 1 });
  }
}

async function blobParaBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
