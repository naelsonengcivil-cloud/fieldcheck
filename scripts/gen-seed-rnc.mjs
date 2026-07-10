// Gera supabase/migrations/0024_seed_rnc.sql a partir de
// seed-data/FieldCheck_Modelos_RNC_v1.xlsx (Marco RNC · Tarefa 2).
//
// Abas → tabelas de referência (upsert idempotente):
//   MODELOS_RNC    → rnc_modelos (+ rnc_modelo_checklists via split ';')
//   ESTRUTURA_RNC  → rnc_secoes
//   TEXTOS_BASE    → rnc_textos_base
//   PLACEHOLDERS   → rnc_placeholders
// Validações locais (falha com exit≠0): 643 textos-base, 9 modelos, 83 checklists
// distintos sem duplicidade, 12 seções, 26 placeholders, cobertura consistente.
// A migração gerada ainda valida no apply que todo checklist_codigo existe em
// public.checklists (integridade referencial sem FK).
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const __dirname = dirname(fileURLToPath(import.meta.url));

const SRC = join(__dirname, "..", "seed-data", "FieldCheck_Modelos_RNC_v1.xlsx");
const OUT = join(__dirname, "..", "supabase", "migrations", "0024_seed_rnc.sql");

const wb = XLSX.readFile(SRC);
const J = (n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: "" });

const clean = (v) => (v == null ? null : String(v).replace(/\s+/g, " ").trim() || null);
const q = (v) => (v == null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const bool = (v) => (String(v).trim().toLowerCase().startsWith("s") ? "true" : "false");

const erros = [];
const check = (cond, msg) => { if (!cond) erros.push(msg); };

// ---------- MODELOS_RNC ----------
const modelosRaw = J("MODELOS_RNC");
const modelos = modelosRaw.map((r) => ({
  id: clean(r["ID Modelo"]),
  nome: clean(r["Nome do Modelo"]),
  fases: clean(r["Fases/Contextos abrangidos"]),
  particularidades: clean(r["Particularidades do modelo"]),
  checklists: String(r["Checklists abrangidos"] ?? "").split(";").map((s) => s.trim()).filter(Boolean),
}));
for (const m of modelos) check(m.id && m.nome, `modelo sem id/nome: ${JSON.stringify(m)}`);

const vinculos = modelos.flatMap((m) => m.checklists.map((c) => ({ modelo_id: m.id, codigo: c })));
const codigosCobertos = vinculos.map((v) => v.codigo);
const dupCobertura = codigosCobertos.filter((c, i) => codigosCobertos.indexOf(c) !== i);

// ---------- ESTRUTURA_RNC ----------
const secoes = J("ESTRUTURA_RNC").map((r) => ({
  ordem: Number(r["Ordem"]),
  secao: clean(r["Seção do Relatório"]),
  instrucao: clean(r["Conteúdo / Instrução de preenchimento"]),
  origem: clean(r["Origem do dado"]),
  editavel: bool(r["Editável pelo cliente"]),
}));
for (const s of secoes) check(Number.isInteger(s.ordem) && s.secao, `seção inválida: ${JSON.stringify(s)}`);

// ---------- TEXTOS_BASE ----------
const textos = J("TEXTOS_BASE").map((r) => ({
  codigo: clean(r["Código Checklist"]),
  numero: Number(r["Nº"]),
  gravidade: clean(r["Gravidade sugerida"]),
  requisito: clean(r["TEXTO-BASE — Requisito Descumprido"]),
  fundamentacao: clean(r["TEXTO-BASE — Fundamentação Normativa"]),
  risco: clean(r["TEXTO-BASE — Risco/Consequência"]),
  acao: clean(r["TEXTO-BASE — Ação Corretiva"]),
}));
for (const t of textos)
  check(t.codigo && Number.isInteger(t.numero) && t.requisito && t.fundamentacao && t.risco && t.acao,
    `texto-base incompleto: ${t.codigo} nº ${t.numero}`);

// ---------- PLACEHOLDERS ----------
const placeholders = J("PLACEHOLDERS").map((r) => ({
  placeholder: clean(r["Placeholder"]),
  significado: clean(r["Significado"]),
  origem: clean(r["Origem do dado"]),
  obrigatorio: clean(r["Obrigatório"]),
}));
for (const p of placeholders) check(p.placeholder && p.significado, `placeholder inválido: ${JSON.stringify(p)}`);

// ---------- validações de contagem/consistência ----------
const codsTextos = new Set(textos.map((t) => t.codigo));
check(textos.length === 643, `esperado 643 textos-base, obtido ${textos.length}`);
check(modelos.length === 9, `esperado 9 modelos, obtido ${modelos.length}`);
check(new Set(codigosCobertos).size === 83, `esperado 83 checklists cobertos, obtido ${new Set(codigosCobertos).size}`);
check(dupCobertura.length === 0, `checklists duplicados entre modelos: ${[...new Set(dupCobertura)].join(", ")}`);
check(secoes.length === 12, `esperado 12 seções, obtido ${secoes.length}`);
check(placeholders.length === 26, `esperado 26 placeholders, obtido ${placeholders.length}`);
// todo checklist coberto por modelo tem textos-base e vice-versa
const semTextos = [...new Set(codigosCobertos)].filter((c) => !codsTextos.has(c));
check(semTextos.length === 0, `checklists em modelos sem textos-base: ${semTextos.join(", ")}`);
const semModelo = [...codsTextos].filter((c) => !codigosCobertos.includes(c));
check(semModelo.length === 0, `checklists com textos-base fora de qualquer modelo: ${semModelo.join(", ")}`);

if (erros.length) {
  console.error("FALHA na validação do seed RNC:\n - " + erros.join("\n - "));
  process.exit(1);
}

// ---------- emissão do SQL ----------
const L = [];
L.push("-- ============================================================");
L.push("-- FieldCheck · Migration 0024 — Seed do módulo RNC (GERADO por scripts/gen-seed-rnc.mjs)");
L.push("-- Fonte: seed-data/FieldCheck_Modelos_RNC_v1.xlsx · NÃO editar à mão.");
L.push("-- Upsert idempotente das 5 tabelas de referência. Aplicar após a 0023.");
L.push("-- ============================================================");
L.push("");

L.push("-- rnc_modelos ----------------------------------------------------------------");
for (const m of modelos)
  L.push(`insert into public.rnc_modelos (id, nome, fases_contextos, particularidades) values (${q(m.id)}, ${q(m.nome)}, ${q(m.fases)}, ${q(m.particularidades)})\n  on conflict (id) do update set nome = excluded.nome, fases_contextos = excluded.fases_contextos, particularidades = excluded.particularidades;`);
L.push("");

L.push("-- rnc_modelo_checklists ------------------------------------------------------");
for (const v of vinculos)
  L.push(`insert into public.rnc_modelo_checklists (modelo_id, checklist_codigo) values (${q(v.modelo_id)}, ${q(v.codigo)}) on conflict do nothing;`);
L.push("");

L.push("-- rnc_secoes -----------------------------------------------------------------");
for (const s of secoes)
  L.push(`insert into public.rnc_secoes (ordem, secao, conteudo_instrucao, origem_dado, editavel) values (${s.ordem}, ${q(s.secao)}, ${q(s.instrucao)}, ${q(s.origem)}, ${s.editavel})\n  on conflict (ordem) do update set secao = excluded.secao, conteudo_instrucao = excluded.conteudo_instrucao, origem_dado = excluded.origem_dado, editavel = excluded.editavel;`);
L.push("");

L.push("-- rnc_placeholders -----------------------------------------------------------");
for (const p of placeholders)
  L.push(`insert into public.rnc_placeholders (placeholder, significado, origem_dado, obrigatorio) values (${q(p.placeholder)}, ${q(p.significado)}, ${q(p.origem)}, ${q(p.obrigatorio)})\n  on conflict (placeholder) do update set significado = excluded.significado, origem_dado = excluded.origem_dado, obrigatorio = excluded.obrigatorio;`);
L.push("");

L.push("-- rnc_textos_base ------------------------------------------------------------");
for (const t of textos)
  L.push(`insert into public.rnc_textos_base (checklist_codigo, item_numero, gravidade_sugerida, texto_requisito_descumprido, texto_fundamentacao_normativa, texto_risco_consequencia, texto_acao_corretiva) values (${q(t.codigo)}, ${t.numero}, ${q(t.gravidade)}, ${q(t.requisito)}, ${q(t.fundamentacao)}, ${q(t.risco)}, ${q(t.acao)})\n  on conflict (checklist_codigo, item_numero) do update set gravidade_sugerida = excluded.gravidade_sugerida, texto_requisito_descumprido = excluded.texto_requisito_descumprido, texto_fundamentacao_normativa = excluded.texto_fundamentacao_normativa, texto_risco_consequencia = excluded.texto_risco_consequencia, texto_acao_corretiva = excluded.texto_acao_corretiva;`);
L.push("");

L.push("-- Integridade referencial (sem FK): todo checklist_codigo existe no catálogo. -");
L.push(`do $$
declare n int;
begin
  select count(*) into n from public.rnc_textos_base t
    where not exists (select 1 from public.checklists c where c.codigo = t.checklist_codigo);
  if n > 0 then raise exception 'RNC seed: % texto(s)-base com checklist_codigo inexistente em checklists', n; end if;
  select count(*) into n from public.rnc_modelo_checklists mc
    where not exists (select 1 from public.checklists c where c.codigo = mc.checklist_codigo);
  if n > 0 then raise exception 'RNC seed: % vínculo(s) de modelo com checklist inexistente', n; end if;
end $$;`);
L.push("");

writeFileSync(OUT, L.join("\n"), "utf8");
console.log(`OK · 0024_seed_rnc.sql gerado:`);
console.log(`  ${modelos.length} modelos · ${vinculos.length} vínculos · ${secoes.length} seções · ${placeholders.length} placeholders · ${textos.length} textos-base`);
