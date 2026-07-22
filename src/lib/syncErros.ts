import type { TabelaFila } from "@/lib/sync";

// ============================================================
// Tradução de erros de sync para linguagem de campo (Entrega C) — puro e
// testável. Mantém o código técnico visível para suporte.
// ============================================================

/** Extrai o código do Postgres do início de `ultimo_erro` (ex.: "23514: ..."). */
export function codigoPg(ultimoErro: string | null | undefined): string | null {
  const m = (ultimoErro ?? "").match(/^([0-9A-Z]{5}):/);
  return m ? m[1] : null;
}

/** Mensagem de campo + código técnico visível, a partir do status/erro. */
export function traduzErroSync(
  status: number | null | undefined,
  ultimoErro: string | null | undefined,
): { amigavel: string; tecnico: string } {
  const pg = codigoPg(ultimoErro);
  const cru = ultimoErro ?? "Falha desconhecida";
  const tecnico = [status ? `HTTP ${status}` : null, pg ? `PG ${pg}` : null].filter(Boolean).join(" · ") || cru;

  let amigavel: string;
  if (status === 401 || /jwt|token|session/i.test(cru)) {
    amigavel = "Sessão expirada. Toque em Tentar novamente para reenviar.";
  } else if (pg === "23514") {
    amigavel = "Registro incompatível com o sistema. Contate o suporte.";
  } else if (pg === "23505") {
    amigavel = "Registro duplicado — já foi enviado.";
  } else if (status === 413) {
    amigavel = "Arquivo grande demais. O app vai tentar comprimir e reenviar.";
  } else if (pg === "23503") {
    amigavel = "Depende de outro registro que ainda não subiu. Tentaremos de novo.";
  } else if (status === 403 || pg === "42501") {
    amigavel = "Sem permissão para enviar este registro.";
  } else if (status == null || (status >= 500) || /network|timeout|fetch/i.test(cru)) {
    amigavel = "Falha temporária de conexão. Tentaremos de novo.";
  } else {
    amigavel = cru;
  }
  return { amigavel, tecnico };
}

/** Rótulo + ícone da operação, por tabela da fila. */
export function rotuloOperacao(tabela: TabelaFila): { label: string; icone: string } {
  switch (tabela) {
    case "inspecoes": return { label: "Inspeção — envio", icone: "📋" };
    case "respostas": return { label: "Item de inspeção", icone: "✅" };
    case "eventos": return { label: "Tratamento de NC", icone: "🔧" };
    case "ocorrencias": return { label: "Desvio/Ocorrência", icone: "📸" };
    case "evidencias": return { label: "Foto — upload", icone: "🖼️" };
  }
}
