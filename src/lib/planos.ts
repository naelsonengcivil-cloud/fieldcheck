import type { Empresa } from "@/types/db";

// ============================================================
// Planos — lógica de gating no cliente (UX). Espelha `plano_vigente()` do
// banco (0056); o enforcement REAL é server-side (RLS/funcões). Aqui é só
// para mostrar cadeado/CTA e habilitar/bloquear ações na interface.
// ============================================================

export type Tier = "basic" | "premium" | "intelligence" | "readonly" | "archived";

export type Feature =
  | "core_inspections"
  | "nc_management_full"
  | "nc_fiscal_executora"
  | "push_notifications"
  | "roles_permissions"
  | "data_export"
  | "bi_dashboard_summary"
  | "bi_full"
  | "ai_nc_argumentation"
  | "smart_alerts"
  | "bird_pyramid"
  | "multi_project_reports"
  | "trend_analysis"
  | "api_webhooks";

/** Uma linha da tabela de config plan_features. */
export interface LinhaFeature {
  feature: Feature;
  basic: boolean;
  premium: boolean;
  intelligence: boolean;
  descricao: string | null;
}

export const ROTULO_PLANO: Record<string, string> = {
  basic: "Basic",
  premium: "Premium",
  intelligence: "Intelligence",
  trial: "Teste (Intelligence)",
  readonly: "Somente leitura",
  archived: "Arquivada",
};

const futuro = (iso?: string | null) => !!iso && new Date(iso).getTime() > Date.now();

/** Tier de gating a partir da empresa — espelha plano_vigente() (0056). */
export function planoVigente(empresa: Empresa | null | undefined): Tier {
  if (!empresa) return "readonly";
  if (futuro(empresa.cortesia_ate)) return "intelligence"; // cortesia super_admin
  const p = empresa.plano as string;
  if (p === "archived") return "archived";
  if (p === "readonly") return "readonly";
  if (p === "trial") return futuro(empresa.trial_expira_em) ? "intelligence" : "readonly";
  if (p === "ativo") return "intelligence"; // legado pré-migração
  if (p === "basic" || p === "premium" || p === "intelligence") return p;
  return "readonly";
}

/** A feature está incluída no tier, segundo a matriz de config (plan_features)? */
export function temFeatureNaMatriz(tier: Tier, feature: Feature, matriz: LinhaFeature[]): boolean {
  if (tier === "readonly" || tier === "archived") return false;
  const linha = matriz.find((l) => l.feature === feature);
  if (!linha) return false;
  return tier === "basic" ? linha.basic : tier === "premium" ? linha.premium : linha.intelligence;
}

/** Menor plano que inclui a feature (para o CTA "disponível no …"). */
export function planoQueInclui(feature: Feature, matriz: LinhaFeature[]): "basic" | "premium" | "intelligence" | null {
  const l = matriz.find((x) => x.feature === feature);
  if (!l) return null;
  return l.basic ? "basic" : l.premium ? "premium" : l.intelligence ? "intelligence" : null;
}

// ── Limites de criação (server → hint estruturado) ──────────────────────────
// Os triggers de limite (0055) levantam `raise ... using hint='upgrade:<recurso>'`
// (ou 'reativar' no modo somente-leitura). O front lê o hint e abre a vitrine —
// nunca concede acesso; só transforma o erro cru numa oferta de upgrade.

export type RecursoLimite = "obras" | "usuarios" | "checklists" | "reativar";

export const COPY_LIMITE: Record<RecursoLimite, { nome: string; corpo: string; planoAlvo: "basic" | "premium" | "intelligence" | null }> = {
  obras: { nome: "Limite de obras atingido", corpo: "Seu plano atual permite um número limitado de obras ativas.", planoAlvo: "premium" },
  usuarios: { nome: "Limite de usuários atingido", corpo: "Convide mais membros da equipe com um plano superior.", planoAlvo: "premium" },
  checklists: { nome: "Limite de checklists personalizados", corpo: "Crie mais checklists próprios com um plano superior.", planoAlvo: "premium" },
  reativar: { nome: "Conta em somente leitura", corpo: "Sua assinatura está inativa. Reative um plano para voltar a criar e editar.", planoAlvo: null },
};

/**
 * Extrai o recurso de um erro estruturado do servidor — hint 'upgrade:<recurso>'
 * ou 'reativar'. Aceita PostgrestError, Error, string ou objeto com hint/message/
 * details (o checklist devolve o hint já como string). Retorna null se não for
 * um erro de limite/plano.
 */
export function extrairUpgradeHint(erro: unknown): RecursoLimite | null {
  const alvos: string[] = [];
  if (typeof erro === "string") alvos.push(erro);
  else if (erro && typeof erro === "object") {
    const e = erro as Record<string, unknown>;
    for (const k of ["hint", "message", "details"]) {
      if (typeof e[k] === "string") alvos.push(e[k] as string);
    }
  }
  for (const s of alvos) {
    const m = s.match(/upgrade:([a-z_]+)/i);
    if (m && (["obras", "usuarios", "checklists"] as string[]).includes(m[1].toLowerCase())) {
      return m[1].toLowerCase() as RecursoLimite;
    }
  }
  for (const s of alvos) if (s.trim() === "reativar") return "reativar";
  return null;
}

/** Dias restantes do trial (para o banner). */
export function diasDeTrial(empresa: Empresa | null | undefined): number | null {
  if (!empresa || empresa.plano !== "trial" || !empresa.trial_expira_em) return null;
  const ms = new Date(empresa.trial_expira_em).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 86_400_000) : 0;
}
