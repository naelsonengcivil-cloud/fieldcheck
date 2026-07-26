// ============================================================
// FieldCheck · Edge Function `excluir-dados-empresa` (Entrega B, art. 18 LGPD)
// ÚNICO ponto de HARD DELETE físico do sistema. Orquestra:
//   1) valida caller = operador da plataforma (super_admin, via JWT);
//   2) BANCO: chama a RPC excluir_dados_empresa_db (pré-condições + delete);
//   3) STORAGE: remove os buckets evidencias/${id}/ e logos/${id}/;
//   4) AUTH: apaga as contas auth.users dos usuarios da empresa;
//   5) grava o resultado (Storage/auth) em exclusoes_lgpd.
//
// dry_run = true é o DEFAULT. Nada apaga sem dry_run:false explícito.
//
// ORDEM (adaptação vs. spec): BANCO antes de STORAGE. A spec pedia Storage
// primeiro para não perder a referência dos paths — mas aqui a remoção é por
// PREFIXO `${empresa_id}/` (independe do banco), então fazer o banco primeiro
// deixa as pré-condições (protegida / assinatura Stripe / motivo) abortarem
// ANTES de qualquer deleção irreversível de arquivo. Falha parcial de Storage
// é registrada em `observacoes` para reprocessamento (o prefixo segue conhecido).
//
// Deploy:  supabase functions deploy excluir-dados-empresa   (COM verificação de
//          JWT — NÃO usar --no-verify-jwt; o JWT do operador é o gate).
// Chamada: POST Authorization: Bearer <jwt do super_admin>
//   body { "empresa_id": "...", "motivo": "...", "dry_run": true,
//          "solicitado_por"?: "..." }
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY injetados.
// ============================================================
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@^2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** Lista todos os arquivos sob `${prefixo}/` (paginado). Estrutura plana. */
async function listarArquivos(admin: SupabaseClient, bucket: string, prefixo: string): Promise<string[]> {
  const paths: string[] = [];
  const limite = 100;
  let offset = 0;
  while (true) {
    const { data, error } = await admin.storage.from(bucket).list(prefixo, { limit: limite, offset });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const f of data) if (f.name) paths.push(`${prefixo}/${f.name}`);
    if (data.length < limite) break;
    offset += limite;
  }
  return paths;
}

/** Remove em lotes; conta removidos e coleta os paths que falharam. */
async function removerArquivos(
  admin: SupabaseClient, bucket: string, paths: string[],
): Promise<{ removidos: number; falhas: string[] }> {
  let removidos = 0;
  const falhas: string[] = [];
  for (let i = 0; i < paths.length; i += 1000) {
    const lote = paths.slice(i, i + 1000);
    const { data, error } = await admin.storage.from(bucket).remove(lote);
    if (error) falhas.push(...lote);
    else removidos += data?.length ?? lote.length;
  }
  return { removidos, falhas };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // 1) Gate: o caller precisa ser operador da plataforma (super_admin).
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "Não autenticado." }, 401);
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: ehOp, error: opErr } = await userClient.rpc("eh_super_admin");
  if (opErr) return json({ error: "Falha ao validar operador." }, 500);
  if (ehOp !== true) return json({ error: "Apenas operadores da plataforma." }, 403);
  // Id do operador (para a trilha): a RPC roda como service_role → auth.uid() é
  // null lá, então gravamos executado_por a partir do JWT aqui.
  const { data: operador } = await userClient.auth.getUser();
  const executadoPor: string | null = operador?.user?.id ?? null;

  const body = await req.json().catch(() => ({}));
  const empresaId: string | undefined = body?.empresa_id;
  const motivo: string | undefined = body?.motivo;
  const solicitadoPor: string | null = body?.solicitado_por ?? null;
  const dryRun: boolean = body?.dry_run !== false; // DEFAULT true — só apaga com false explícito
  if (!empresaId) return json({ error: "empresa_id obrigatório." }, 400);
  if (!motivo || !motivo.trim()) return json({ error: "motivo obrigatório." }, 400);

  const admin = createClient(url, serviceKey);

  try {
    // Ids de auth ANTES de qualquer delete (o banco vai remover as linhas usuarios).
    const { data: usuarios, error: usrErr } = await admin
      .from("usuarios").select("id").eq("empresa_id", empresaId);
    if (usrErr) return json({ error: `Falha ao ler usuarios: ${usrErr.message}` }, 500);
    const userIds = (usuarios ?? []).map((u: { id: string }) => u.id);

    // 2) BANCO. Pré-condições + inventário (dry-run) OU delete real. Aborta aqui
    //    (sem tocar Storage) se protegida / assinatura ativa / motivo vazio.
    const { data: rpc, error: rpcErr } = await admin.rpc("excluir_dados_empresa_db", {
      p_empresa_id: empresaId,
      p_motivo: motivo,
      p_dry_run: dryRun,
    });
    if (rpcErr) return json({ error: rpcErr.message }, 400);
    const exclusaoId: string = rpc.exclusao_id;
    const contadores = rpc.contadores;
    const empresaNome: string = rpc.empresa_nome;

    // Inventário de Storage (sempre — no dry-run só conta; no real, remove).
    const evidPaths = await listarArquivos(admin, "evidencias", empresaId);
    const logoPaths = await listarArquivos(admin, "logos", empresaId);
    const storageTotal = evidPaths.length + logoPaths.length;

    // Completa a trilha: operador que executou (JWT) + solicitante (texto livre).
    await admin.from("exclusoes_lgpd").update({
      executado_por: executadoPor,
      ...(solicitadoPor ? { solicitado_por: solicitadoPor } : {}),
    }).eq("id", exclusaoId);

    if (dryRun) {
      // DRY-RUN: nada é removido. Registra o que SERIA removido do Storage.
      await admin.from("exclusoes_lgpd").update({
        observacoes: `dry-run: ${storageTotal} arquivo(s) no Storage seriam removidos `
          + `(evidencias=${evidPaths.length}, logos=${logoPaths.length}); `
          + `${userIds.length} conta(s) auth.users seriam apagadas.`,
      }).eq("id", exclusaoId);

      return json({
        dry_run: true,
        empresa_id: empresaId,
        empresa_nome: empresaNome,
        exclusao_id: exclusaoId,
        contadores,
        storage: { evidencias: evidPaths.length, logos: logoPaths.length, total: storageTotal },
        auth_users: userIds.length,
        aviso: "Nada foi apagado. Confira os contadores e rode de novo com dry_run:false para executar.",
      });
    }

    // 3) STORAGE (real). Remove por prefixo; falha parcial é registrada.
    const rEvid = await removerArquivos(admin, "evidencias", evidPaths);
    const rLogo = await removerArquivos(admin, "logos", logoPaths);
    const storageRemovidos = rEvid.removidos + rLogo.removidos;
    const storageFalhas = [...rEvid.falhas, ...rLogo.falhas];

    // 4) AUTH. Apaga as contas de login (o banco já removeu as linhas usuarios).
    const authFalhas: string[] = [];
    for (const id of userIds) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) authFalhas.push(id);
    }

    // 5) Fecha a trilha com o resultado de Storage/auth.
    const obs: string[] = [];
    if (storageFalhas.length) obs.push(`Storage NÃO removido (${storageFalhas.length}): ${storageFalhas.join(", ")}`);
    if (authFalhas.length) obs.push(`auth.users NÃO apagados (${authFalhas.length}): ${authFalhas.join(", ")}`);
    obs.push(`auth.users apagados: ${userIds.length - authFalhas.length}/${userIds.length}.`);
    await admin.from("exclusoes_lgpd").update({
      storage_removidos: storageRemovidos,
      storage_falhas: storageFalhas.length,
      observacoes: obs.join(" | "),
    }).eq("id", exclusaoId);

    const okTotal = storageFalhas.length === 0 && authFalhas.length === 0;
    return json({
      dry_run: false,
      ok: okTotal,
      empresa_id: empresaId,
      empresa_nome: empresaNome,
      exclusao_id: exclusaoId,
      contadores,
      storage: { removidos: storageRemovidos, falhas: storageFalhas.length },
      auth_users: { apagados: userIds.length - authFalhas.length, falhas: authFalhas.length },
      aviso: okTotal ? undefined : "Exclusão concluída COM falhas parciais — ver observacoes em exclusoes_lgpd.",
    }, okTotal ? 200 : 207);
  } catch (e) {
    return json({ error: (e as Error)?.message ?? "Falha na exclusão." }, 500);
  }
});
