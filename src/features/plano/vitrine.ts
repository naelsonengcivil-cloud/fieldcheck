import type { Feature } from "@/lib/planos";

// ============================================================
// Dados de apresentação da página de Planos (Frente 3, Lote 2).
// Preços = vitrine (marketing). A cobrança REAL é o Stripe; o preço de
// fundador é o que a empresa assinou lá. Comparação curada (rótulos de
// cliente) puxando ✓/— de plan_features e valores de plan_limits.
// ============================================================

export type TierPago = "basic" | "premium" | "intelligence";
export const ORDEM_TIERS: TierPago[] = ["basic", "premium", "intelligence"];

// Intelligence é por assento; mínimo 3 (espelha o clamp da Edge criar-checkout).
export const PRECO_ASSENTO_INTELLIGENCE = 89;
export const SEATS_MIN_INTELLIGENCE = 3;

export interface PrecoVitrine {
  valor: string;
  unidade: string;
  chamada: string;
  detalhe?: string;
}

export const PRECOS: Record<TierPago, PrecoVitrine> = {
  basic: { valor: "R$ 79,90", unidade: "/mês", chamada: "Para começar" },
  premium: { valor: "R$ 199", unidade: "/mês", chamada: "Equipe · até 5 usuários" },
  intelligence: {
    valor: "R$ 89",
    unidade: "/usuário·mês",
    chamada: "Tudo, com IA e BI",
    detalhe: "Mín. 3 usuários — a partir de R$ 267/mês",
  },
};

// Linha da tabela plan_limits (config no banco).
export interface LinhaLimite {
  plano: string;
  obras_ativas: number | null;
  usuarios: number | null;
  checklists_personalizados: number | null;
  storage_gb: number | null;
  retencao_dias: number | null;
}

type CampoLimite = keyof Omit<LinhaLimite, "plano">;

export interface LinhaComparacao {
  rotulo: string;
  feature?: Feature; // célula ✓ / —
  limite?: { campo: CampoLimite; fmt: (v: number | null, plano: string) => string }; // célula com valor
}

export interface GrupoComparacao {
  titulo: string;
  linhas: LinhaComparacao[];
}

const ilimObras = (v: number | null) => (v == null ? "Ilimitadas" : String(v));
const ilimCk = (v: number | null) => (v == null ? "Ilimitados" : String(v));
const usuariosFmt = (v: number | null, plano: string) =>
  plano === "intelligence" ? "Por assento" : v == null ? "Ilimitados" : String(v);
const storageFmt = (v: number | null) => (v == null ? "—" : `${v} GB`);
const retencaoFmt = (v: number | null) => (v == null ? "Ilimitada" : `${v} dias`);

export const GRUPOS_COMPARACAO: GrupoComparacao[] = [
  {
    titulo: "Inspeção & campo",
    linhas: [
      { rotulo: "Inspeções, checklists, offline, PDF, APK", feature: "core_inspections" },
      { rotulo: "Obras ativas", limite: { campo: "obras_ativas", fmt: ilimObras } },
      { rotulo: "Checklists personalizados", limite: { campo: "checklists_personalizados", fmt: ilimCk } },
      { rotulo: "Usuários", limite: { campo: "usuarios", fmt: usuariosFmt } },
    ],
  },
  {
    titulo: "Gestão",
    linhas: [
      { rotulo: "NC completo (criticidade + prazos)", feature: "nc_management_full" },
      { rotulo: "Ciclo fiscal–executora", feature: "nc_fiscal_executora" },
      { rotulo: "Papéis e permissões", feature: "roles_permissions" },
      { rotulo: "Notificações push", feature: "push_notifications" },
      { rotulo: "Exportação Excel/CSV", feature: "data_export" },
      { rotulo: "Retenção de histórico", limite: { campo: "retencao_dias", fmt: retencaoFmt } },
      { rotulo: "Armazenamento", limite: { campo: "storage_gb", fmt: storageFmt } },
    ],
  },
  {
    titulo: "Inteligência & BI",
    linhas: [
      { rotulo: "Banco de experiência (resumo)", feature: "bi_dashboard_summary" },
      { rotulo: "Dashboard analítico (RF19)", feature: "bi_full" },
      { rotulo: "Redação de RNC por IA", feature: "ai_nc_argumentation" },
      { rotulo: "Alertas inteligentes com IA", feature: "smart_alerts" },
      { rotulo: "Pirâmide de Bird + ocorrências", feature: "bird_pyramid" },
      { rotulo: "Relatórios consolidados multi-obra", feature: "multi_project_reports" },
      { rotulo: "Tendências entre obras", feature: "trend_analysis" },
    ],
  },
];
