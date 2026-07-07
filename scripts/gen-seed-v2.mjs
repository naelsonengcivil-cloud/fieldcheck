// Gera supabase/migrations/0019_seed_catalogo_v2.sql a partir do catálogo
// mestre v2 (abas Checklists / Itens / Kits). Marco E.
//
// Mantém o esquema de UUID v5 do gen-seed.mjs (checklist:CODIGO, item:CODIGO#ordem)
// => upsert em cima dos checklists/itens já existentes (0005). Kits = modelos do
// sistema (empresa_id null), uuid v5 por kit:NOME. Idempotente.
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const __dirname = dirname(fileURLToPath(import.meta.url));

const SRC = join(__dirname, "..", "FieldCheck_Catalogo_Mestre_v2.xlsx");

// ---------- uuid v5 (igual ao gen-seed.mjs) ----------
const NS = "6f1b2c4a-9d3e-5a7b-8c10-fieldcheck00";
const uuidToBytes = (u) => { const hex = u.replace(/[^0-9a-f]/gi, ""); const b = Buffer.alloc(16); for (let i = 0; i < 16; i++) b[i] = parseInt(hex.substr(i * 2, 2), 16); return b; };
const bytesToUuid = (b) => { const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join(""); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`; };
function uuidv5(name) {
  const hash = createHash("sha1").update(Buffer.concat([uuidToBytes(NS), Buffer.from(name, "utf8")])).digest();
  const b = Buffer.from(hash.subarray(0, 16)); b[6] = (b[6] & 0x0f) | 0x50; b[8] = (b[8] & 0x3f) | 0x80; return bytesToUuid(b);
}

const clean = (v) => (v == null ? null : String(v).replace(/\s+/g, " ").trim() || null);

const MOD = {
  "Civil": "civil", "Comissionamento": "comissionamento", "Edificações": "edificacoes",
  "Eletromecânica": "eletromecanica", "Elétrica": "eletrica", "Linhas de Transmissão": "linhas_transmissao",
  "Reformas": "reformas", "Telecom": "telecom", "Transversal (SSMA e Gestão)": "transversal",
};
const TIPO = {
  "Documentação": "documentacao", "Equipamentos": "equipamentos", "Execução/Processo": "execucao",
  "Meio Ambiente": "meio_ambiente", "Qualidade": "qualidade", "Segurança (NR)": "seguranca_nr",
};
const KIT_PERSONALIZADO = "Kit Personalizado (montado pelo cliente)";

const wb = XLSX.readFile(SRC);
const cksRaw = XLSX.utils.sheet_to_json(wb.Sheets["Checklists"], { defval: "" });
const itensRaw = XLSX.utils.sheet_to_json(wb.Sheets["Itens"], { defval: "" });
const kitsRaw = XLSX.utils.sheet_to_json(wb.Sheets["Kits"], { defval: "" });

// ---------- checklists ----------
const q = (v) => (v == null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const qArr = (arr) => (arr && arr.length ? `array[${arr.map(q).join(", ")}]` : "null");

const checklists = cksRaw.map((r) => {
  const codigo = clean(r["Código"]);
  const modDisplay = clean(r["Módulo"]);
  const tipoDisplay = clean(r["Tipo"]);
  const modulo = MOD[modDisplay]; const tipo = TIPO[tipoDisplay];
  if (!codigo) throw new Error("checklist sem código");
  if (!modulo) throw new Error(`módulo não mapeado: "${modDisplay}" (${codigo})`);
  if (!tipo) throw new Error(`tipo não mapeado: "${tipoDisplay}" (${codigo})`);
  const nrs = clean(r["NRs relacionadas"]);
  return {
    codigo, modulo, tipo,
    nome: clean(r["Nome do Checklist"]),
    area: modDisplay, // rótulo legível do módulo
    fase: clean(r["Fase/Contexto"]),
    referencia: clean(r["Referência-base (norma/manual/documento do cliente)"]),
    nrs: nrs ? nrs.split(/[;,]/).map((s) => s.trim()).filter(Boolean) : [],
    exigeProj: clean(r["Exige projeto ref."]) === "Sim",
  };
});
const codToId = new Map(checklists.map((c) => [c.codigo, uuidv5(`checklist:${c.codigo}`)]));

// ---------- itens ----------
const itens = [];
for (const r of itensRaw) {
  const codigo = clean(r["Código Checklist"]);
  const ordem = r["Nº"];
  const texto = clean(r["Item de Verificação"]);
  if (!codigo || texto == null || ordem === "" || ordem == null) continue;
  if (!codToId.has(codigo)) throw new Error(`item de checklist inexistente: ${codigo}`);
  itens.push({ codigo, ordem: Number(ordem), texto, criterio: clean(r["Critério / O que verificar"]) });
}

// ---------- kits ----------
const kitsMap = new Map(); // nome -> Set(codigos)
for (const r of kitsRaw) {
  const nome = clean(r["Kit de Obra"]);
  const cod = clean(r["Código Checklist"]);
  if (!nome || nome === KIT_PERSONALIZADO || !cod) continue;
  if (!kitsMap.has(nome)) kitsMap.set(nome, new Set());
  kitsMap.get(nome).add(cod);
}
const kits = [...kitsMap.entries()].map(([nome, cods]) => ({ nome, id: uuidv5(`kit:${nome}`), cods: [...cods] }));

// ---------- SQL ----------
const L = [];
L.push("-- ============================================================");
L.push("-- FieldCheck · Migration 0019 — Seed do catálogo mestre v2 (Marco E)");
L.push("-- GERADO por scripts/gen-seed-v2.mjs — não editar à mão.");
L.push(`-- ${checklists.length} checklists / ${itens.length} itens / ${kits.length} kits-modelo. empresa_id = NULL.`);
L.push("-- Idempotente: UUID v5 determinístico + ON CONFLICT DO UPDATE. Aplicar após a 0018.");
L.push("-- ============================================================");
L.push("begin;");
L.push("");

const ckVals = checklists.map((c) => {
  const id = codToId.get(c.codigo);
  return `  ('${id}', null, ${q(c.codigo)}, ${q(c.area)}, ${q(c.referencia)}, ${q(c.nome)}, 1, true, ${q(c.modulo)}, ${q(c.tipo)}, ${q(c.fase)}, ${q(c.referencia)}, ${qArr(c.nrs)}, ${c.exigeProj})`;
});
L.push("insert into public.checklists (id, empresa_id, codigo, area, referencia, nome, versao, ativo, modulo, tipo, fase, referencia_documento, nrs_relacionadas, exige_projeto_ref) values");
L.push(ckVals.join(",\n") + "");
L.push("on conflict (id) do update set");
L.push("  area = excluded.area, referencia = excluded.referencia, nome = excluded.nome, ativo = true,");
L.push("  modulo = excluded.modulo, tipo = excluded.tipo, fase = excluded.fase,");
L.push("  referencia_documento = excluded.referencia_documento, nrs_relacionadas = excluded.nrs_relacionadas,");
L.push("  exige_projeto_ref = excluded.exige_projeto_ref;");
L.push("");

const itVals = itens.map((it) => {
  const id = uuidv5(`item:${it.codigo}#${it.ordem}`);
  return `  ('${id}', '${codToId.get(it.codigo)}', ${it.ordem}, ${q(it.texto)}, ${q(it.criterio)})`;
});
L.push("insert into public.itens_checklist (id, checklist_id, ordem, texto, criterio) values");
L.push(itVals.join(",\n") + "");
L.push("on conflict (id) do update set");
L.push("  ordem = excluded.ordem, texto = excluded.texto, criterio = excluded.criterio;");
L.push("");

// kits-modelo (empresa_id null)
const kitVals = kits.map((k) => `  ('${k.id}', null, ${q(k.nome)}, null, true)`);
L.push("insert into public.kits (id, empresa_id, nome, descricao, ativo) values");
L.push(kitVals.join(",\n") + "");
L.push("on conflict (id) do update set nome = excluded.nome, ativo = true;");
L.push("");
// composição: recria (delete+insert) só dos kits-modelo semeados
L.push(`delete from public.kit_checklists where kit_id in (${kits.map((k) => `'${k.id}'`).join(", ")});`);
const kcVals = [];
for (const k of kits) for (const cod of k.cods) kcVals.push(`  ('${k.id}', '${codToId.get(cod)}')`);
L.push("insert into public.kit_checklists (kit_id, checklist_id) values");
L.push(kcVals.join(",\n") + "");
L.push("on conflict (kit_id, checklist_id) do nothing;");
L.push("");

// heurística: sugestão de classificação p/ itens de checklists de segurança (tipo seguranca_nr)
L.push("-- Sugestão de classificação (Bird) por item de checklist de segurança (tipo seguranca_nr).");
L.push(`update public.itens_checklist i set classificacao_st_sugerida = 'ato_inseguro'
  from public.checklists c
 where c.id = i.checklist_id and c.tipo = 'seguranca_nr' and i.classificacao_st_sugerida is null
   and (i.texto ilike '%epi%' or i.texto ilike '%uso %' or i.texto ilike '%utiliza%'
        or i.texto ilike '%procedimento%' or i.texto ilike '%apr%' or i.texto ilike '%permiss%'
        or i.texto ilike '%treina%' or i.texto ilike '%capacita%' or i.texto ilike '%comportament%'
        or i.texto ilike '%conduta%' or i.texto ilike '%integra%' or i.texto ilike '%habilita%');`);
L.push(`update public.itens_checklist i set classificacao_st_sugerida = 'condicao_insegura'
  from public.checklists c
 where c.id = i.checklist_id and c.tipo = 'seguranca_nr' and i.classificacao_st_sugerida is null;`);
L.push("");
L.push("commit;");
L.push("");

const outPath = join(__dirname, "..", "supabase", "migrations", "0019_seed_catalogo_v2.sql");
writeFileSync(outPath, L.join("\n"), "utf8");
console.error(`checklists: ${checklists.length} | itens: ${itens.length} | kits: ${kits.length} | kit_checklists: ${kcVals.length}`);
console.error(`kits: ${kits.map((k) => `${k.nome.split(" (")[0]}(${k.cods.length})`).join(", ")}`);
console.error(`-> ${outPath}`);
