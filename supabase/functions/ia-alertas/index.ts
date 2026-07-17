// ============================================================
// FieldCheck · ia-alertas — Marco L, Fase 2: INTERPRETAÇÃO por IA.
//
// Recebe os alertas recém-criados pela camada de DETECÇÃO (trigger 0052 →
// pg_net) e enriquece cada um com `analise_ia`: narrativa de gestão +
// priorização + ações recomendadas.
//
// Salvaguardas (herdadas do Marco K):
//  - a IA raciocina SOMENTE sobre os fatos enviados (dados_fonte do banco);
//    não inventa números, normas, causas ou nomes;
//  - amostra pequena → a própria análise deve modular a conclusão;
//  - `origem_ia` marcado + `ia_uso` registrado (custeio, K1);
//  - gate por empresa: `ia_habilitada` (K2);
//  - IA indisponível NÃO bloqueia: o alerta da detecção já foi entregue.
//
// Secrets: ANTHROPIC_API_KEY, CRON_SECRET (header x-cron-secret),
//          ALERTAS_AI_MODEL (opcional; fallback = RNC_AI_MODEL / haiku).
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@^2";

const MODEL =
  Deno.env.get("ALERTAS_AI_MODEL") || Deno.env.get("RNC_AI_MODEL") || "claude-haiku-4-5";

// Tarifa pública por 1M tokens (estimativa p/ custeio interno; a fatura real é do provedor).
function estimarCustoUSD(model: string, tokIn: number, tokOut: number): number {
  const T: Array<{ re: RegExp; in: number; out: number }> = [
    { re: /opus/i, in: 15, out: 75 },
    { re: /haiku/i, in: 0.8, out: 4 },
    { re: /sonnet/i, in: 3, out: 15 },
  ];
  const t = T.find((x) => x.re.test(model)) ?? T[2];
  return Math.round(((tokIn / 1e6) * t.in + (tokOut / 1e6) * t.out) * 1e5) / 1e5;
}

const SYSTEM = [
  "Você é um analista de gestão de obras que interpreta achados de inspeção para gestores.",
  "",
  "REGRAS INEGOCIÁVEIS:",
  "- Raciocine SOMENTE sobre os fatos fornecidos. NUNCA invente números, normas, causas, nomes ou datas.",
  "- Não repita os números crus em lista: interprete o que eles significam para a gestão da obra.",
  "- Se a amostra for pequena, diga isso explicitamente e module a conclusão (não afirme tendência).",
  "- Não prometa resultado nem afirme culpa; recomende ações verificáveis.",
  "",
  "FORMATO: português, tom objetivo de gestão, no máximo 90 palavras, sem markdown.",
  "Estrutura: 1 frase do que está acontecendo e por que importa + 2 a 3 ações recomendadas.",
].join("\n");

Deno.serve(async (req) => {
  const segredo = Deno.env.get("CRON_SECRET");
  if (segredo && req.headers.get("x-cron-secret") !== segredo) {
    return new Response(JSON.stringify({ error: "não autorizado" }), { status: 401 });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let ids: string[] = [];
  try {
    const body = await req.json();
    ids = (body?.alertas ?? []).map((x: { id: string }) => x.id).filter(Boolean);
  } catch {
    return new Response(JSON.stringify({ error: "payload inválido" }), { status: 400 });
  }
  if (!ids.length) return json({ analisados: 0 });
  if (!apiKey) return json({ analisados: 0, motivo: "ANTHROPIC_API_KEY ausente" });

  // Só alertas ainda sem análise, de empresas com IA habilitada (K2).
  const { data: alertas } = await admin
    .from("alertas")
    .select("id, empresa_id, tipo, severidade, titulo, corpo, dados_fonte, empresas!inner(ia_habilitada)")
    .in("id", ids)
    .is("analise_ia", null);

  let ok = 0;
  for (const a of alertas ?? []) {
    const emp = (a as { empresas?: { ia_habilitada?: boolean } }).empresas;
    if (emp?.ia_habilitada === false) continue; // gate por empresa

    try {
      const prompt = [
        `tipo: ${a.tipo}`,
        `severidade: ${a.severidade}`,
        `titulo: ${a.titulo}`,
        `resumo_deteccao: ${a.corpo}`,
        `fatos (exclusivamente do banco): ${JSON.stringify(a.dados_fonte)}`,
        "",
        "Escreva a análise de gestão conforme as regras.",
      ].join("\n");

      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 30_000);
      let data: { content?: Array<{ type: string; text: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
      try {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 400,
            system: SYSTEM,
            messages: [{ role: "user", content: prompt }],
          }),
          signal: ctrl.signal,
        });
        if (!r.ok) throw new Error(`Anthropic HTTP ${r.status}`);
        data = await r.json();
      } finally {
        clearTimeout(t);
      }

      const texto = (data.content ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      if (!texto) throw new Error("resposta vazia");

      await admin.from("alertas").update({ analise_ia: texto, origem_ia: true }).eq("id", a.id);

      // Metering (K1) — nunca quebra o fluxo.
      try {
        const ti = data.usage?.input_tokens ?? 0;
        const to = data.usage?.output_tokens ?? 0;
        await admin.from("ia_uso").insert({
          empresa_id: a.empresa_id,
          funcao: "ia-alertas",
          modelo: MODEL,
          tokens_in: ti,
          tokens_out: to,
          custo_est_usd: estimarCustoUSD(MODEL, ti, to),
          sucesso: true,
        });
      } catch (e) {
        console.error("ia-alertas: falha ao registrar ia_uso —", (e as Error)?.message);
      }
      ok++;
    } catch (e) {
      // IA indisponível/falha → alerta segue sem análise (detecção já entregue).
      console.error("ia-alertas: alerta", a.id, "sem análise —", (e as Error)?.message);
    }
  }

  return json({ analisados: ok, total: (alertas ?? []).length });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
