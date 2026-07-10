// ============================================================
// FieldCheck · Edge Function `relatorio-semanal` (RF17)
// Resumo semanal por e-mail (gestor/admin): inspeções da semana, %
// conformidade, NCs abertas/vencidas por criticidade e top obras.
// Agenda via pg_cron → pg_net (ver docs/relatorio-semanal-setup.md).
//
// Deploy:  supabase functions deploy relatorio-semanal --no-verify-jwt
// Secrets: RESEND_API_KEY, RESEND_FROM (ex.: "FieldCheck <relatorios@fieldcheck.app.br>"),
//          CRON_SECRET (mesmo valor no header x-cron-secret do agendamento),
//          APP_URL (link no rodapé do e-mail).
//          SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY injetados no runtime.
//
// Chamada: POST com header  x-cron-secret: <CRON_SECRET>
//          body opcional { "empresa_id": "..." } para enviar a uma só (teste).
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@^2";

const CRIT = ["critica", "alta", "media", "baixa"] as const;
const ROTULO_CRIT: Record<string, string> = { critica: "Crítica", alta: "Alta", media: "Média", baixa: "Baixa" };
const COR_CRIT: Record<string, string> = { critica: "#C0392B", alta: "#E07B39", media: "#B7950B", baixa: "#1E8449" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  // Autenticação por segredo de cron (a função é deployada sem verify_jwt).
  const segredo = Deno.env.get("CRON_SECRET");
  if (segredo && req.headers.get("x-cron-secret") !== segredo) {
    return json({ error: "Não autorizado." }, 401);
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM");
  if (!resendKey || !from) return json({ error: "RESEND_API_KEY/RESEND_FROM ausentes." }, 500);
  const appUrl = Deno.env.get("APP_URL") ?? "https://fieldcheck.app.br";

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const body = await req.json().catch(() => ({}));
  const empresaFiltro: string | undefined = body?.empresa_id;

  // Janela: últimos 7 dias.
  const hoje = new Date();
  const seteDias = new Date(hoje.getTime() - 7 * 86_400_000);
  const deISO = seteDias.toISOString();
  const hojeData = hoje.toISOString().slice(0, 10);

  // Empresas a processar.
  let empresasQ = admin.from("empresas").select("id, nome");
  if (empresaFiltro) empresasQ = empresasQ.eq("id", empresaFiltro);
  const { data: empresas } = await empresasQ;

  let enviados = 0;
  const resultados: { empresa: string; emails: number }[] = [];

  for (const emp of empresas ?? []) {
    const resumo = await montarResumo(admin, emp.id, deISO, hojeData);
    // Sem atividade recente e sem NCs em aberto → não envia (evita ruído).
    if (resumo.inspecoes === 0 && resumo.ncAbertasTotal === 0) continue;

    const destinatarios = await emailsGestores(admin, emp.id);
    if (destinatarios.length === 0) continue;

    const html = montarHtml(emp.nome, resumo, appUrl, deISO, hojeData);
    const assunto = `FieldCheck — Resumo semanal · ${emp.nome}`;
    let ok = 0;
    for (const email of destinatarios) {
      const enviado = await enviarResend(resendKey, from, email, assunto, html);
      if (enviado) ok++;
    }
    enviados += ok;
    resultados.push({ empresa: emp.nome, emails: ok });
  }

  return json({ ok: true, empresas: resultados.length, emails_enviados: enviados, detalhe: resultados });
});

// ---------- agregação ----------
interface Resumo {
  inspecoes: number;
  pontos: number;
  conformes: number;
  naoConformes: number;
  pct: number;
  ncAbertasTotal: number;
  vencidas: number;
  porCriticidade: Record<string, number>; // abertas por criticidade
  topObras: { obra: string; abertas: number }[];
}

async function montarResumo(admin: ReturnType<typeof createClient>, empresaId: string, deISO: string, hojeData: string): Promise<Resumo> {
  // Inspeções finalizadas na semana.
  const { data: insps } = await admin
    .from("inspecoes")
    .select("id, obra_id")
    .eq("empresa_id", empresaId)
    .eq("status", "finalizada")
    .gte("finalizada_em", deISO);
  const inspIds = (insps ?? []).map((i) => i.id);

  let conformes = 0, naoConformes = 0, pontos = 0;
  if (inspIds.length) {
    const { data: resp } = await admin.from("respostas").select("resposta, inspecao_id").in("inspecao_id", inspIds);
    for (const r of resp ?? []) {
      pontos++;
      if (r.resposta === "C") conformes++;
      else if (r.resposta === "NC") naoConformes++;
    }
  }
  const pct = conformes + naoConformes > 0 ? Math.round((conformes / (conformes + naoConformes)) * 100) : 100;

  // NCs em aberto (estado atual) da empresa, por criticidade + vencidas.
  const { data: evs } = await admin
    .from("eventos_nc")
    .select("status, prazo, criticidade, obra_id")
    .eq("empresa_id", empresaId)
    .not("status", "in", "(aprovada,fechado)");
  const porCriticidade: Record<string, number> = { critica: 0, alta: 0, media: 0, baixa: 0 };
  const abertasPorObra = new Map<string, number>();
  let vencidas = 0;
  for (const e of evs ?? []) {
    if (e.criticidade && porCriticidade[e.criticidade] !== undefined) porCriticidade[e.criticidade]++;
    if (e.prazo && e.prazo < hojeData) vencidas++;
    if (e.obra_id) abertasPorObra.set(e.obra_id, (abertasPorObra.get(e.obra_id) ?? 0) + 1);
  }
  const ncAbertasTotal = (evs ?? []).length;

  // Nomes das top 3 obras com NC aberta.
  const topIds = [...abertasPorObra.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  let topObras: { obra: string; abertas: number }[] = [];
  if (topIds.length) {
    const { data: obras } = await admin.from("obras").select("id, nome").in("id", topIds.map(([id]) => id));
    const nome = new Map((obras ?? []).map((o) => [o.id, o.nome]));
    topObras = topIds.map(([id, n]) => ({ obra: nome.get(id) ?? "Obra", abertas: n }));
  }

  return { inspecoes: inspIds.length, pontos, conformes, naoConformes, pct, ncAbertasTotal, vencidas, porCriticidade, topObras };
}

async function emailsGestores(admin: ReturnType<typeof createClient>, empresaId: string): Promise<string[]> {
  const { data: us } = await admin
    .from("usuarios")
    .select("id, papel, ativo")
    .eq("empresa_id", empresaId)
    .in("papel", ["gestor", "admin"]);
  const emails: string[] = [];
  for (const u of us ?? []) {
    if (u.ativo === false) continue;
    const { data } = await admin.auth.admin.getUserById(u.id);
    if (data?.user?.email) emails.push(data.user.email);
  }
  return [...new Set(emails)];
}

// ---------- e-mail ----------
async function enviarResend(key: string, from: string, to: string, subject: string, html: string): Promise<boolean> {
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!r.ok) console.error("Resend falhou:", r.status, await r.text());
    return r.ok;
  } catch (e) {
    console.error("Resend erro:", (e as Error)?.message);
    return false;
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const brData = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

function montarHtml(empresa: string, r: Resumo, appUrl: string, deISO: string, hojeData: string): string {
  const periodo = `${brData(deISO)} a ${brData(hojeData + "T00:00:00Z")}`;
  const kpi = (label: string, valor: string, cor = "#16181B") =>
    `<td style="padding:10px;border:1px solid #e5e5e0;border-radius:8px;text-align:center">
       <div style="font-size:22px;font-weight:700;color:${cor};font-family:Arial,sans-serif">${valor}</div>
       <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.3px">${esc(label)}</div>
     </td>`;
  const critRows = CRIT.map((c) =>
    `<tr><td style="padding:4px 8px;color:${COR_CRIT[c]};font-weight:700">${ROTULO_CRIT[c]}</td>
         <td style="padding:4px 8px;text-align:right">${r.porCriticidade[c] ?? 0}</td></tr>`,
  ).join("");
  const obrasRows = r.topObras.length
    ? r.topObras.map((o) => `<tr><td style="padding:4px 8px">${esc(o.obra)}</td><td style="padding:4px 8px;text-align:right;font-weight:700;color:#C0392B">${o.abertas}</td></tr>`).join("")
    : `<tr><td style="padding:4px 8px;color:#888" colspan="2">Sem NCs em aberto 🎉</td></tr>`;

  return `<!doctype html><html><body style="margin:0;background:#f4f4f1;font-family:Arial,Helvetica,sans-serif;color:#16181B">
  <div style="max-width:600px;margin:0 auto;padding:20px">
    <div style="background:#1C2733;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0">
      <div style="font-size:18px;font-weight:700">Resumo semanal — ${esc(empresa)}</div>
      <div style="font-size:12px;opacity:.85">Período: ${periodo}</div>
    </div>
    <div style="background:#fff;padding:20px;border-radius:0 0 12px 12px;border:1px solid #e5e5e0;border-top:none">
      <table style="width:100%;border-collapse:separate;border-spacing:6px"><tr>
        ${kpi("Inspeções (semana)", String(r.inspecoes), "#1C2733")}
        ${kpi("% Conformidade", `${r.pct}%`, r.pct >= 90 ? "#1E8449" : r.pct >= 70 ? "#B7950B" : "#C0392B")}
        ${kpi("NCs abertas", String(r.ncAbertasTotal), r.ncAbertasTotal ? "#C0392B" : "#1E8449")}
        ${kpi("Vencidas", String(r.vencidas), r.vencidas ? "#C0392B" : "#1E8449")}
      </tr></table>

      <h3 style="font-size:14px;margin:18px 0 6px">NCs abertas por criticidade</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>${critRows}</tbody></table>

      <h3 style="font-size:14px;margin:18px 0 6px">Obras com mais NCs em aberto</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>${obrasRows}</tbody></table>

      <div style="margin-top:20px;text-align:center">
        <a href="${appUrl}" style="display:inline-block;background:#F2B705;color:#16181B;font-weight:700;text-decoration:none;padding:10px 20px;border-radius:10px">Abrir o FieldCheck</a>
      </div>
      <div style="margin-top:16px;font-size:11px;color:#999;text-align:center;line-height:1.5">
        Você recebe este resumo por ser gestor(a)/admin no FieldCheck.<br/>Gerado automaticamente — não responda este e-mail.
      </div>
    </div>
  </div></body></html>`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
