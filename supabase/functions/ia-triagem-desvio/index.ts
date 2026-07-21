// ============================================================
// FieldCheck · Edge Function `ia-triagem-desvio` (Marco M · M-2)
// Triagem por IA de um desvio avulso a partir das fotos. Contrato K/L:
//   • linguagem de possibilidade; declara o que a imagem NÃO permite confirmar;
//   • PROIBIÇÃO ABSOLUTA de citar item numerado de norma a partir de foto —
//     no máximo norma/capítulo em nível de tema ("NR-35 — Trabalho em Altura");
//     defesa em profundidade: sanitização remove subitens que escapem;
//   • saída é SEMPRE sugestão ("IA · revise") — nada é salvo sem confirmação
//     humana; a IA indisponível NUNCA bloqueia o registro manual;
//   • gate por empresa: empresas.ia_habilitada; metering em ia_uso.
//
// Dois modos (JWT do usuário obrigatório):
//   { fotos_base64: string[], contexto? }  → análise imediata (formulário)
//   { ocorrencia_id }                      → pós-sync: lê fotos do Storage e
//                                            grava triagem_ia na ocorrência
//
// Deploy:  supabase functions deploy ia-triagem-desvio
// Secrets: ANTHROPIC_API_KEY; TRIAGEM_AI_MODEL (opcional; fallback
//          RNC_AI_MODEL → claude-sonnet-4-6)
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@^2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Modelo próprio da triagem (NÃO herda o RNC_AI_MODEL, que é Haiku e entrega
// triagem genérica). Sonnet por padrão; ajustável pelo secret sem redeploy.
const MODEL = Deno.env.get("TRIAGEM_AI_MODEL") || "claude-sonnet-4-6";

const MAX_FOTOS = 3;
const TIPOS_DESVIO = new Set(["ato_inseguro", "condicao_insegura", "quase_acidente"]);
const CRITICIDADES = new Set(["baixa", "media", "alta", "critica"]);

// Versão do prompt (rastreada em ia_uso.prompt_version).
const PROMPT_VERSION = 2;

// Catálogo normativo curado (o modelo escolhe SOMENTE desta lista). Bloco
// demarcado para facilitar revisão/edição pelo time. Nomenclatura atual:
// gerenciamento de riscos = PGR (NR-01); "PPRA" está extinto.
const CATALOGO_NORMAS = `Segurança do trabalho (NRs):
- NR-01 — Disposições Gerais e Gerenciamento de Riscos Ocupacionais (PGR)
- NR-04 — SESMT
- NR-05 — CIPA
- NR-06 — Equipamento de Proteção Individual (EPI)
- NR-07 — PCMSO
- NR-10 — Segurança em Instalações e Serviços em Eletricidade
- NR-11 — Transporte, Movimentação, Armazenagem e Manuseio de Materiais
- NR-12 — Segurança no Trabalho em Máquinas e Equipamentos
- NR-15 — Atividades e Operações Insalubres
- NR-16 — Atividades e Operações Perigosas
- NR-17 — Ergonomia
- NR-18 — Segurança e Saúde no Trabalho na Indústria da Construção
- NR-20 — Inflamáveis e Combustíveis
- NR-23 — Proteção Contra Incêndios
- NR-24 — Condições Sanitárias e de Conforto nos Locais de Trabalho
- NR-26 — Sinalização de Segurança
- NR-33 — Segurança e Saúde nos Trabalhos em Espaços Confinados
- NR-35 — Trabalho em Altura

Técnicas (NBRs e correlatas):
- NBR 5410 — Instalações Elétricas de Baixa Tensão
- NBR 14039 — Instalações Elétricas de Média Tensão
- NBR 5419 — Proteção Contra Descargas Atmosféricas (SPDA)
- NBR 16690 — Instalações Elétricas de Arranjos Fotovoltaicos
- NBR 6118 — Estruturas de Concreto — Procedimento
- NBR 14931 — Execução de Estruturas de Concreto
- NBR 8800 — Estruturas de Aço e Mistas
- NBR 6122 — Fundações — Projeto e Execução
- NBR 13529/13749 — Revestimentos de Argamassa
- NBR 9575 — Impermeabilização — Seleção e Projeto
- NBR 5674 — Manutenção de Edificações
- NBR ISO 9001 — Sistema de Gestão da Qualidade (tratamento de NC)`;

const SYSTEM_PROMPT = `Você é engenheiro de qualidade e segurança do trabalho sênior, especialista em inspeções de campo em obras de infraestrutura no Brasil (UFVs, subestações, linhas de transmissão, montagem eletromecânica, obras civis e O&M). Faz a triagem de um desvio a partir de fotos e do contexto da inspeção. Devolve uma TRIAGEM SUGERIDA (a pessoa revisa e decide). Triagem genérica é pior que nenhuma.

ANÁLISE DAS FOTOS:
- Descreva o que é OBJETIVAMENTE visível antes de interpretar (elemento/equipamento, condição aparente, EPIs/EPCs presentes ou ausentes, sinais de improviso, entorno).
- Diferencie o que OBSERVA (fato) do que INFERE (marque inferência com "Possível:").
- Se a foto não permitir conclusão segura (ângulo/luz/distância), diga e indique que registro adicional fazer.
- Aponte também desvios secundários visíveis além do relatado.

PROFUNDIDADE OBRIGATÓRIA:
- Para cada risco, descreva o MECANISMO e a CONSEQUÊNCIA concreta. Errado: "empilhamento inadequado". Certo: "empilhamento sem travamento pode tombar sobre trabalhador em circulação — risco de contusão e perda do insumo".
- Proibido frases que serviriam a qualquer desvio; ancore tudo em algo específico das fotos ou dos dados.

CAMPO descricao_visivel: concentre AQUI a descrição técnica com mecanismo+consequência e os desvios secundários (texto corrido objetivo, engenharia, pt-BR, sem títulos de seção, sem markdown).

CLASSIFICAÇÃO: 'ato_inseguro' (comportamento de pessoa), 'condicao_insegura' (estado do ambiente/equipamento/instalação) ou 'quase_acidente'. Na dúvida entre ato e condição, use condicao_insegura.

CRITICIDADE ('baixa'|'media'|'alta'|'critica'): proporcional ao dano REAL e visível. Não infle — organização/armazenamento tende a baixa/media; reserve alta/critica para risco iminente de lesão grave (queda de altura, choque, soterramento, incêndio).

NORMAS (familias_normativas): 0 a 3 itens EXCLUSIVAMENTE do catálogo abaixo, formato exato "Norma — Tema", só quando a relação for clara. Melhor vazio que errado. NUNCA cite item/subitem numerado (ex.: "NR-35.4.1.2"). NUNCA use nomenclatura extinta (ex.: "NR-09 — PPRA" não existe; gerenciamento de riscos = PGR, NR-01). Se nada se aplicar com segurança, use um único item "Verificação normativa recomendada — <tema>".

CATÁLOGO (única fonte permitida):
${CATALOGO_NORMAS}

LIMITAÇÕES (limitacoes): 1 frase curta com o essencial que a imagem não permite confirmar (ex.: "Não confirma treinamento, ancoragem ou laudos"). Sem listas longas.

Responda SOMENTE com o JSON pedido, sem markdown e sem preâmbulo.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // 1) Usuário autenticado + empresa.
    const asUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await asUser.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Não autenticado." }, 401);

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: usuario } = await admin
      .from("usuarios")
      .select("id, empresa_id")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!usuario) return json({ error: "Usuário sem empresa." }, 400);

    // 2) Gate por empresa (interruptor de IA existente — K2).
    const { data: empresaRow } = await admin
      .from("empresas")
      .select("ia_habilitada")
      .eq("id", usuario.empresa_id)
      .maybeSingle();
    if (empresaRow?.ia_habilitada === false) {
      return json({ error: "A análise por IA está desativada para a empresa." }, 403);
    }

    // 3) Monta as imagens conforme o modo.
    let imageBlocks: unknown[] = [];
    let contexto: Record<string, unknown> = {};
    let ocorrenciaId: string | null = null;

    if (Array.isArray(body?.fotos_base64) && body.fotos_base64.length > 0) {
      // Modo imediato: fotos vêm do aparelho (ainda não sincronizadas).
      imageBlocks = (body.fotos_base64 as string[]).slice(0, MAX_FOTOS).map((b64) => ({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: b64 },
      }));
      contexto = body?.contexto ?? {};
    } else if (typeof body?.ocorrencia_id === "string") {
      // Modo pós-sync: lê o desvio e as fotos do Storage.
      ocorrenciaId = body.ocorrencia_id;
      const { data: oc } = await admin
        .from("ocorrencias")
        .select("id, empresa_id, tipo, descricao, frente, obra_id")
        .eq("id", ocorrenciaId)
        .maybeSingle();
      if (!oc) return json({ error: "Desvio não encontrado." }, 404);
      if (oc.empresa_id !== usuario.empresa_id) return json({ error: "Fora do escopo da empresa." }, 403);
      if (!TIPOS_DESVIO.has(oc.tipo)) return json({ error: "O registro não é um desvio avulso." }, 400);

      const { data: obra } = await admin.from("obras").select("nome").eq("id", oc.obra_id).maybeSingle();
      contexto = { obra: obra?.nome ?? null, frente: oc.frente, descricao: oc.descricao };

      const { data: evs } = await admin
        .from("evidencias")
        .select("url")
        .eq("ocorrencia_id", ocorrenciaId)
        .not("url", "is", null)
        .limit(MAX_FOTOS);
      for (const e of evs ?? []) {
        try {
          const { data: file } = await admin.storage.from("evidencias").download(e.url as string);
          if (file) {
            imageBlocks.push({
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: bytesToB64(new Uint8Array(await file.arrayBuffer())) },
            });
          }
        } catch { /* foto indisponível — segue sem ela */ }
      }
    } else {
      return json({ error: "Informe fotos_base64 ou ocorrencia_id." }, 400);
    }
    if (imageBlocks.length === 0) return json({ error: "Nenhuma foto disponível para análise." }, 400);

    // 4) IA + validação + sanitização (defesa em profundidade contra item numerado).
    let triagem: Triagem | null = null;
    let usage = { input: 0, output: 0 };
    try {
      const out = await triarComIA(imageBlocks, contexto);
      triagem = sanitizar(out.triagem);
      usage = out.usage;
    } catch (e) {
      console.error("ia-triagem-desvio: IA indisponível —", (e as Error)?.message);
    }

    // 5) Metering (K1) — nunca bloqueia.
    try {
      await admin.from("ia_uso").insert({
        empresa_id: usuario.empresa_id,
        funcao: "ia-triagem-desvio",
        modelo: MODEL,
        prompt_version: PROMPT_VERSION,
        tokens_in: usage.input,
        tokens_out: usage.output,
        custo_est_usd: estimarCustoUSD(MODEL, usage.input, usage.output),
        sucesso: triagem !== null,
        created_by: usuario.id,
      });
    } catch (e) {
      console.error("ia-triagem-desvio: falha ao registrar ia_uso —", (e as Error)?.message);
    }

    if (!triagem) return json({ error: "Análise indisponível no momento." }, 502);

    // 6) Pós-sync: grava a sugestão na ocorrência (revisão posterior no app).
    if (ocorrenciaId) {
      const { error: upErr } = await admin
        .from("ocorrencias")
        .update({ triagem_ia: triagem, triagem_em: new Date().toISOString() })
        .eq("id", ocorrenciaId);
      if (upErr) console.error("ia-triagem-desvio: falha ao gravar triagem —", upErr.message);
    }

    return json({ triagem });
  } catch (e) {
    return json({ error: (e as Error)?.message ?? "Erro inesperado." }, 500);
  }
});

interface Triagem {
  descricao_visivel: string;
  classificacao: string;
  criticidade: string;
  familias_normativas: string[];
  limitacoes: string;
}

async function triarComIA(
  imageBlocks: unknown[],
  contexto: Record<string, unknown>,
): Promise<{ triagem: Triagem; usage: { input: number; output: number } }> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY ausente");

  let tokIn = 0;
  let tokOut = 0;

  const partes: string[] = [];
  if (contexto?.obra) partes.push(`Obra: ${contexto.obra}`);
  if (contexto?.frente) partes.push(`Frente de serviço: ${contexto.frente}`);
  if (contexto?.contratada) partes.push(`Contratada: ${contexto.contratada}`);
  if (contexto?.descricao) partes.push(`Descrição do observador: ${contexto.descricao}`);

  const instrucao =
    `CONTEXTO MÍNIMO (não é evidência; a evidência são as fotos):\n${partes.join("\n") || "(sem contexto)"}\n\n` +
    `Analise as fotos e retorne SOMENTE este JSON (sem markdown):\n` +
    `{"descricao_visivel":"o que é objetivamente visível, em linguagem de possibilidade",` +
    `"classificacao":"ato_inseguro|condicao_insegura|quase_acidente",` +
    `"criticidade":"baixa|media|alta|critica",` +
    `"familias_normativas":["NR-35 — Trabalho em Altura"],` +
    `"limitacoes":"o que a imagem NÃO permite confirmar"}`;

  const chamar = async (reforco = "") => {
    const content = [...imageBlocks, { type: "text", text: instrucao + reforco }];
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30_000);
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({ model: MODEL, max_tokens: 1500, temperature: 0.2, system: SYSTEM_PROMPT, messages: [{ role: "user", content }] }),
        signal: ctrl.signal,
      });
      if (!r.ok) throw new Error(`Anthropic HTTP ${r.status}`);
      const data = await r.json();
      tokIn += data.usage?.input_tokens ?? 0;
      tokOut += data.usage?.output_tokens ?? 0;
      return (data.content ?? [])
        .filter((b: { type: string }) => b.type === "text")
        .map((b: { text: string }) => b.text)
        .join("");
    } finally {
      clearTimeout(t);
    }
  };

  let texto = await chamar();
  let parsed = tentarParse(texto);
  if (!parsed) {
    texto = await chamar("\n\nATENÇÃO: sua resposta anterior não era JSON válido. Responda AGORA apenas com o objeto JSON, sem nenhum outro texto.");
    parsed = tentarParse(texto);
  }
  if (!parsed) throw new Error("JSON inválido após retry");
  return { triagem: parsed, usage: { input: tokIn, output: tokOut } };
}

/** Parse tolerante: aceita JSON puro ou embutido em texto. */
function tentarParse(texto: string): Triagem | null {
  const tenta = (s: string): Triagem | null => {
    try {
      const j = JSON.parse(s);
      if (typeof j?.descricao_visivel !== "string" || typeof j?.classificacao !== "string") return null;
      return {
        descricao_visivel: j.descricao_visivel,
        classificacao: j.classificacao,
        criticidade: String(j.criticidade ?? ""),
        familias_normativas: Array.isArray(j.familias_normativas) ? j.familias_normativas.map(String) : [],
        limitacoes: String(j.limitacoes ?? ""),
      };
    } catch {
      return null;
    }
  };
  const direto = tenta(texto.trim());
  if (direto) return direto;
  const ini = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (ini >= 0 && fim > ini) return tenta(texto.slice(ini, fim + 1));
  return null;
}

/** Valida enums e REMOVE qualquer subitem numerado de norma que escape ("NR-18.12.5" → "NR-18"). */
function sanitizar(t: Triagem): Triagem {
  const semItem = (s: string) => s.replace(/\b((?:NBR|NR|IEC|ISO|ONS)\s?-?\s?\d+)((?:\.\d+)+)/gi, "$1");
  return {
    descricao_visivel: semItem(t.descricao_visivel).slice(0, 1200),
    classificacao: TIPOS_DESVIO.has(t.classificacao) ? t.classificacao : "condicao_insegura",
    criticidade: CRITICIDADES.has(t.criticidade) ? t.criticidade : "media",
    familias_normativas: t.familias_normativas.map(semItem).filter(Boolean).slice(0, 2),
    limitacoes: semItem(t.limitacoes).slice(0, 300),
  };
}

// Custo estimado (USD) — tarifa pública por 1M tokens, por família de modelo.
function estimarCustoUSD(model: string, tokIn: number, tokOut: number): number {
  const TARIFAS: Array<{ re: RegExp; in: number; out: number }> = [
    { re: /opus/i, in: 15, out: 75 },
    { re: /haiku/i, in: 0.8, out: 4 },
    { re: /sonnet/i, in: 3, out: 15 },
  ];
  const t = TARIFAS.find((x) => x.re.test(model)) ?? TARIFAS[2];
  const usd = (tokIn / 1_000_000) * t.in + (tokOut / 1_000_000) * t.out;
  return Math.round(usd * 1e5) / 1e5;
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
