// ============================================================
// FieldCheck · Edge Function `rnc-generate` (Marco RNC · Tarefa 3)
// Gera uma RNC pré-preenchida a partir de um item reprovado (resposta 'NC').
//   1) Interpolação DETERMINÍSTICA (sem IA) dos placeholders de plataforma.
//   2) Redação assistida por IA (Anthropic · claude-sonnet-4-6) com papel
//      restrito: lapida a descrição no texto, sugere gravidade e complementos.
//      Saída SOMENTE JSON; parse com retry 1x.
//   3) Fallback: se a IA falhar, grava a RNC só com a interpolação
//      (secoes_agente = null) — o registro NUNCA é bloqueado.
//
// Deploy:  supabase functions deploy rnc-generate
// Secret:  ANTHROPIC_API_KEY  (chave só no servidor; nunca no cliente)
//          SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY são
//          injetados automaticamente no runtime.
// Requer JWT do usuário (Authorization: Bearer <token>).
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@^2";
import { montarValores, interpolarSecoes, parseGravidade, tentarParse, VALID_GRAV } from "./logica.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Modelo configurável via secret RNC_AI_MODEL (fallback: Sonnet 4.6).
const MODEL = Deno.env.get("RNC_AI_MODEL") || "claude-sonnet-4-6";

const SYSTEM_PROMPT = `Você é o agente de redação de RNC do FieldCheck. Recebe textos-base normativos já interpolados e a evidência de campo (descrição + fotos). Regras invioláveis:
- NUNCA invente fatos, medições, normas ou referências que não estejam nos textos-base ou na evidência fornecida.
- NUNCA remova ou altere citações normativas (NBR, NR, IEC, ONS, manuais) dos textos-base.
- Preserve os placeholders remanescentes ({{prazo}}, {{responsavel}}, {{evidencia_foto_correcao}}) exatamente como estão.
- Ajuste apenas fluidez e concordância ao integrar a descrição de campo ao texto.
- Gravidade: parta da sugestão informada; eleve/reduza somente com justificativa objetiva na evidência.
- Responda SOMENTE com o JSON no schema solicitado, sem markdown e sem preâmbulo.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const resposta_item_id: string | undefined = body?.resposta_item_id;
    if (!resposta_item_id) return json({ error: "resposta_item_id é obrigatório." }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // 1) Identifica o usuário pelo JWT.
    const asUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await asUser.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Não autenticado." }, 401);

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: usuario } = await admin
      .from("usuarios")
      .select("id, empresa_id, nome")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!usuario) return json({ error: "Usuário sem empresa." }, 400);

    // 2) Carrega o contexto da NC.
    const { data: resp } = await admin
      .from("respostas")
      .select("id, inspecao_id, item_id, resposta, observacao")
      .eq("id", resposta_item_id)
      .maybeSingle();
    if (!resp) return json({ error: "Resposta não encontrada." }, 404);
    if (resp.resposta !== "NC") return json({ error: "A resposta não é uma não conformidade." }, 400);

    const { data: insp } = await admin
      .from("inspecoes")
      .select("id, empresa_id, obra_id, checklist_id, inspetor_id, frente, contratada, projeto_ref_numero, projeto_ref_revisao, finalizada_em")
      .eq("id", resp.inspecao_id)
      .single();
    if (insp.empresa_id !== usuario.empresa_id) return json({ error: "Fora do escopo da empresa." }, 403);

    // RNC já existe para esta resposta? Evita duplicidade (idempotência prática).
    const { data: existente } = await admin
      .from("rncs")
      .select("*")
      .eq("resposta_item_id", resp.id)
      .maybeSingle();
    if (existente) return json({ rnc: existente, ja_existia: true });

    const [{ data: obra }, { data: checklist }, { data: item }, { data: inspetor }, { data: empresaRow }] = await Promise.all([
      admin.from("obras").select("id, nome, cliente").eq("id", insp.obra_id).single(),
      admin.from("checklists").select("id, codigo, nome, exige_projeto_ref").eq("id", insp.checklist_id).single(),
      admin.from("itens_checklist").select("id, ordem, texto, criterio, texto_base_rnc").eq("id", resp.item_id).single(),
      admin.from("usuarios").select("nome").eq("id", insp.inspetor_id).maybeSingle(),
      admin.from("empresas").select("ia_habilitada").eq("id", insp.empresa_id).maybeSingle(),
    ]);
    // Liga/desliga da IA por empresa (K2). Coluna nova/ausente → default habilitado.
    const iaHabilitada = empresaRow?.ia_habilitada !== false;

    // Texto-base do item (chave: código do checklist + nº do item = ordem).
    // CONVENIÊNCIA, não pré-requisito: se não houver, a RNC é gerada com as
    // seções em branco para preenchimento manual (itens do padrão ainda sem
    // texto + checklists personalizados). Nunca bloqueia.
    const { data: base } = await admin
      .from("rnc_textos_base")
      .select("*")
      .eq("checklist_codigo", checklist.codigo)
      .eq("item_numero", item.ordem)
      .maybeSingle();

    // Modelo de RNC do checklist (opcional — pode não existir p/ personalizados).
    const { data: vinc } = await admin
      .from("rnc_modelo_checklists")
      .select("modelo_id")
      .eq("checklist_codigo", checklist.codigo)
      .maybeSingle();
    const modelo_id: string | null = vinc?.modelo_id ?? null;

    const descricao_nc = String(body?.descricao_nc ?? resp.observacao ?? "").trim();
    const local = String(body?.local ?? insp.frente ?? obra.nome ?? "").trim();
    const ativo = String(body?.ativo ?? "").trim();

    // 3) Numeração sequencial por empresa/ano.
    const { data: numero, error: numErr } = await admin.rpc("next_rnc_numero", {
      p_empresa_id: insp.empresa_id,
    });
    if (numErr || !numero) return json({ error: "Falha ao gerar a numeração da RNC." }, 500);

    // 4) Interpolação determinística (placeholders de plataforma + campo).
    const valores = montarValores({
      numero: String(numero),
      obra: obra.nome ?? "",
      cliente: obra.cliente ?? "",
      contratada: insp.contratada ?? "",
      checklist_codigo: checklist.codigo,
      checklist_nome: checklist.nome,
      criterio: item.criterio ?? "",
      item_numero: item.ordem,
      item_verificacao: item.texto,
      data_inspecao_iso: insp.finalizada_em,
      inspetor: inspetor?.nome ?? "",
      local,
      ativo,
      descricao_nc,
      exige_projeto_ref: !!checklist.exige_projeto_ref,
      projeto_num: insp.projeto_ref_numero ?? "",
      projeto_rev: insp.projeto_ref_revisao ?? "",
    });
    // Com texto-base de plataforma → interpola (pré-preenchido, editável).
    // Sem → usa o texto-base do item (checklists personalizados, passo 4) como
    // pré-preenchimento do requisito; se nem isso, seções em branco (manual).
    const secoesInterp = base
      ? interpolarSecoes(base, valores)
      : {
          requisito: String((item as { texto_base_rnc?: string | null }).texto_base_rnc ?? "").trim(),
          fundamentacao: "",
          risco: "",
          acao: "",
        };

    // 5) Fotos de abertura → base64 (até 3) para a evidência visual do agente.
    const { data: evs } = await admin
      .from("evidencias")
      .select("url")
      .eq("resposta_id", resp.id)
      .not("url", "is", null)
      .limit(3);
    const fotos = (evs ?? []).map((e) => e.url).filter(Boolean) as string[];
    // 6) IA — só quando há texto-base (há o que refinar). Sem base, a RNC nasce
    //    em branco para preenchimento manual, sem IA. Fallback silencioso.
    const gravBase = base ? parseGravidade(base.gravidade_sugerida) : "maior";
    let secoes_agente: typeof secoesInterp | null = null;
    let gravidade_sugerida_agente: string | null = null;
    let risco_complementar: string | null = null;
    let acao_complementar: string | null = null;

    // Só chama IA quando há o que refinar (texto-base) E a empresa habilitou (K2).
    const iaTentada = !!base && iaHabilitada;
    let iaUsage = { input: 0, output: 0 };

    if (iaTentada) {
      const imageBlocks: unknown[] = [];
      for (const path of fotos) {
        try {
          const { data: file } = await admin.storage.from("evidencias").download(path);
          if (file) {
            const b64 = bytesToB64(new Uint8Array(await file.arrayBuffer()));
            imageBlocks.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } });
          }
        } catch { /* foto indisponível — segue sem ela */ }
      }
      try {
        const out = await gerarComIA(secoesInterp, descricao_nc, base!.gravidade_sugerida, imageBlocks);
        secoes_agente = out.secoes;
        gravidade_sugerida_agente = VALID_GRAV.has(out.gravidade_sugerida) ? out.gravidade_sugerida : null;
        risco_complementar = out.risco_complementar_sugerido || null;
        acao_complementar = out.acao_complementar_sugerido || null;
        iaUsage = out.usage;
      } catch (e) {
        console.error("rnc-generate: IA indisponível, usando fallback determinístico —", (e as Error)?.message);
      }
    }

    const gravidade = gravidade_sugerida_agente ?? gravBase;
    const secoes_final = secoes_agente ?? secoesInterp;

    // 7) Persiste a RNC.
    const { data: rnc, error: insErr } = await admin
      .from("rncs")
      .insert({
        numero,
        empresa_id: insp.empresa_id,
        obra_id: insp.obra_id,
        inspecao_id: insp.id,
        resposta_item_id: resp.id,
        modelo_id,
        checklist_codigo: checklist.codigo,
        item_numero: item.ordem,
        local: local || null,
        ativo: ativo || null,
        descricao_nc,
        fotos,
        gravidade,
        gravidade_sugerida_agente,
        secoes_agente,
        secoes_final,
        risco_complementar,
        acao_complementar,
        status: "aberta",
        created_by: usuario.id,
      })
      .select("*")
      .single();
    if (insErr) return json({ error: "Falha ao salvar a RNC: " + insErr.message }, 500);

    // K1 — registra o uso de IA por empresa (custeio/precificação futura).
    // Só quando a IA foi de fato acionada; nunca bloqueia/quebra a RNC.
    if (iaTentada) {
      try {
        await admin.from("ia_uso").insert({
          empresa_id: insp.empresa_id,
          funcao: "rnc-generate",
          modelo: MODEL,
          tokens_in: iaUsage.input,
          tokens_out: iaUsage.output,
          custo_est_usd: estimarCustoUSD(MODEL, iaUsage.input, iaUsage.output),
          sucesso: secoes_agente !== null,
          created_by: usuario.id,
        });
      } catch (e) {
        console.error("rnc-generate: falha ao registrar ia_uso —", (e as Error)?.message);
      }
    }

    return json({ rnc, origem_ia: secoes_agente !== null });
  } catch (e) {
    return json({ error: (e as Error)?.message ?? "Erro inesperado." }, 500);
  }
});

// ---------- IA: chamada direta à Messages API (sem SDK) ----------
async function gerarComIA(
  secoesInterp: { requisito: string; fundamentacao: string; risco: string; acao: string },
  descricao_nc: string,
  gravidadeBase: string,
  imageBlocks: unknown[],
): Promise<{
  secoes: { requisito: string; fundamentacao: string; risco: string; acao: string };
  gravidade_sugerida: string;
  risco_complementar_sugerido: string;
  acao_complementar_sugerido: string;
  usage: { input: number; output: number };
}> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY ausente");

  // Tokens acumulados entre as (até 2) chamadas — base do contador de uso (K1).
  let tokIn = 0;
  let tokOut = 0;

  const instrucao =
    `Modelo/gravidade sugerida do texto-base: "${gravidadeBase}".\n\n` +
    `TEXTOS-BASE JÁ INTERPOLADOS (preserve citações normativas e placeholders remanescentes como {{prazo}}, {{responsavel}}, {{evidencia_foto_correcao}}):\n` +
    `[REQUISITO]\n${secoesInterp.requisito}\n\n[FUNDAMENTACAO]\n${secoesInterp.fundamentacao}\n\n[RISCO]\n${secoesInterp.risco}\n\n[ACAO]\n${secoesInterp.acao}\n\n` +
    `DESCRIÇÃO DE CAMPO DO INSPETOR:\n${descricao_nc || "(sem descrição adicional)"}\n\n` +
    (imageBlocks.length ? `As imagens anexas são a evidência fotográfica da não conformidade.\n\n` : "") +
    `Retorne SOMENTE este JSON (sem markdown):\n` +
    `{"secoes":{"requisito":"...","fundamentacao":"...","risco":"...","acao":"..."},"gravidade_sugerida":"critica|maior|menor|observacao","risco_complementar_sugerido":"1-2 frases","acao_complementar_sugerido":"1-2 frases"}`;

  const content = [...imageBlocks, { type: "text", text: instrucao }];

  const chamar = async (extraReforco = "") => {
    const messages = [{ role: "user", content: extraReforco ? [...imageBlocks, { type: "text", text: instrucao + extraReforco }] : content }];
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 45_000);
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({ model: MODEL, max_tokens: 3000, system: SYSTEM_PROMPT, messages }),
        signal: ctrl.signal,
      });
      if (!r.ok) throw new Error(`Anthropic HTTP ${r.status}`);
      const data = await r.json();
      tokIn += data.usage?.input_tokens ?? 0;
      tokOut += data.usage?.output_tokens ?? 0;
      return (data.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
    } finally {
      clearTimeout(t);
    }
  };

  // 1ª tentativa; se o JSON vier inválido, 1 retry com reforço.
  let texto = await chamar();
  let parsed = tentarParse(texto);
  if (!parsed) {
    texto = await chamar("\n\nATENÇÃO: sua resposta anterior não era JSON válido. Responda AGORA apenas com o objeto JSON, sem nenhum outro texto.");
    parsed = tentarParse(texto);
  }
  if (!parsed) throw new Error("JSON inválido após retry");
  return { ...parsed, usage: { input: tokIn, output: tokOut } };
}

// Custo estimado (USD) por chamada — tarifa pública por 1M tokens, por família de
// modelo. Só estimativa para custeio interno; a fatura real vem do provedor.
function estimarCustoUSD(model: string, tokIn: number, tokOut: number): number {
  const TARIFAS: Array<{ re: RegExp; in: number; out: number }> = [
    { re: /opus/i, in: 15, out: 75 },
    { re: /haiku/i, in: 0.8, out: 4 },
    { re: /sonnet/i, in: 3, out: 15 }, // default de fato (modelo atual)
  ];
  const t = TARIFAS.find((x) => x.re.test(model)) ?? TARIFAS[2];
  const usd = (tokIn / 1_000_000) * t.in + (tokOut / 1_000_000) * t.out;
  return Math.round(usd * 1e5) / 1e5; // 5 casas (numeric(10,5))
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
