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

/** Dias restantes do trial (para o banner). */
export function diasDeTrial(empresa: Empresa | null | undefined): number | null {
  if (!empresa || empresa.plano !== "trial" || !empresa.trial_expira_em) return null;
  const ms = new Date(empresa.trial_expira_em).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 86_400_000) : 0;
}
