import type { ClassificacaoST, TipoOcorrencia } from "@/types/db";

// ============================================================
// Pirâmide de Bird (segurança preditiva, Marco A2) — puro e testável.
// 4 níveis (base → topo) com a razão de referência clássica 1:10:30:600:
//   base  = classificações de NC de ST (ato + condição + quase-acidente)
//   dano_material · acidente_sem_afastamento · acidente_com_afastamento
// Destaca SUBNOTIFICAÇÃO: base fina frente aos acidentes = alerta de
// pouco registro de quase-acidentes (não de segurança boa).
// ============================================================

export type ChaveBird =
  | "base"
  | "dano_material"
  | "acidente_sem_afastamento"
  | "acidente_com_afastamento";

export interface NivelBird {
  chave: ChaveBird;
  rotulo: string;
  count: number;
  ref: number; // proporção de referência de Bird
}

export interface KpisBird {
  /** base → topo. */
  niveis: NivelBird[];
  base: { ato_inseguro: number; condicao_insegura: number; quase_acidente: number };
  total: number;
  topoTotal: number; // dano + acidentes
  /** quase-acidentes/condições da base por acidente/dano (null se topo=0). */
  razaoBaseTopo: number | null;
  subnotificacao: boolean;
  leitura: string;
}

// Referência de Bird (base:dano:sem:com) = 600:30:10:1.
const REF = { base: 600, dano_material: 30, acidente_sem_afastamento: 10, acidente_com_afastamento: 1 };
// Base "saudável" ≈ 600/(30+10+1) ≈ 14,6× os acidentes+danos. Abaixo de ~1/3
// disso (base < ~5× o topo) sinalizamos subnotificação.
const FATOR_SUBNOTIF = 5;

export function calcularBird(
  respostasClassificadas: { classificacao_st?: ClassificacaoST | null }[],
  ocorrencias: { tipo: TipoOcorrencia }[],
): KpisBird {
  const base = { ato_inseguro: 0, condicao_insegura: 0, quase_acidente: 0 };
  for (const r of respostasClassificadas) {
    // 'na' (item documental) fica FORA da pirâmide (melhoria 2).
    if (r.classificacao_st && r.classificacao_st !== "na") base[r.classificacao_st]++;
  }
  const baseTotal = base.ato_inseguro + base.condicao_insegura + base.quase_acidente;

  let dano = 0, sem = 0, com = 0;
  for (const o of ocorrencias) {
    if (o.tipo === "dano_material") dano++;
    else if (o.tipo === "acidente_sem_afastamento") sem++;
    else if (o.tipo === "acidente_com_afastamento") com++;
  }
  const topoTotal = dano + sem + com;

  const niveis: NivelBird[] = [
    { chave: "base", rotulo: "Atos/condições inseguras · quase-acidentes", count: baseTotal, ref: REF.base },
    { chave: "dano_material", rotulo: "Danos materiais", count: dano, ref: REF.dano_material },
    { chave: "acidente_sem_afastamento", rotulo: "Acidentes sem afastamento", count: sem, ref: REF.acidente_sem_afastamento },
    { chave: "acidente_com_afastamento", rotulo: "Acidentes com afastamento", count: com, ref: REF.acidente_com_afastamento },
  ];

  const razaoBaseTopo = topoTotal > 0 ? baseTotal / topoTotal : null;
  const subnotificacao = topoTotal > 0 && baseTotal < topoTotal * FATOR_SUBNOTIF;

  let leitura: string;
  if (baseTotal === 0 && topoTotal === 0) {
    leitura = "Sem registros de segurança no período selecionado.";
  } else if (subnotificacao) {
    leitura =
      `Base fina (${baseTotal}) frente a ${topoTotal} acidente(s)/dano(s): indício de ` +
      `SUBNOTIFICAÇÃO de quase-acidentes e condições inseguras — não é sinal de segurança boa. ` +
      `Estimule o registro da base (a pirâmide de Bird espera ~600 eventos de base para cada acidente grave).`;
  } else if (topoTotal === 0) {
    leitura = `Base registrada (${baseTotal}) e nenhum acidente/dano no período — bom sinal; mantenha o registro ativo.`;
  } else {
    leitura =
      `Proporção base × topo em ${razaoBaseTopo?.toFixed(1)}:1 — dentro do esperado para uma ` +
      `cultura de registro ativa (referência de Bird ~1:10:30:600).`;
  }

  return {
    niveis,
    base,
    total: baseTotal + topoTotal,
    topoTotal,
    razaoBaseTopo,
    subnotificacao,
    leitura,
  };
}
