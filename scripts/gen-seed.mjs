// Gera supabase/migrations/0005_seed_catalogo.sql a partir da aba "Checklists"
// da planilha Programa_Inspecoes_Canteiro.xlsx.
//
// Mapeamento (ESPECIFICACAO.md §4 / §5 seed):
//   checklists.codigo     <- col A "Código"
//   checklists.area       <- col B "Área"
//   checklists.referencia <- col C "Referência" (texto completo)
//   checklists.nome       <- título após o traço da referência (default acordado)
//   itens_checklist.ordem <- col D "Nº"
//   itens_checklist.texto <- col E "Item de Verificação"
//   itens_checklist.criterio <- col F "Critério / O que verificar"
//
// Catálogo padrão do sistema: empresa_id = NULL.
// UUIDs determinísticos (uuid v5) => reexecução é idempotente (ON CONFLICT id).
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------- uuid v5 (sem dependências) ----------
const NS = "6f1b2c4a-9d3e-5a7b-8c10-fieldcheck00"; // namespace fixo do projeto
function uuidToBytes(u) {
  const hex = u.replace(/[^0-9a-f]/gi, "");
  const b = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) b[i] = parseInt(hex.substr(i * 2, 2), 16);
  return b;
}
function bytesToUuid(b) {
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
function uuidv5(name) {
  const hash = createHash("sha1")
    .update(Buffer.concat([uuidToBytes(NS), Buffer.from(name, "utf8")]))
    .digest();
  const b = Buffer.from(hash.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50; // versão 5
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
  return bytesToUuid(b);
}

// ---------- leitura da planilha ----------
const wb = XLSX.readFile(join(__dirname, "..", "Programa_Inspecoes_Canteiro.xlsx"));
const rows = XLSX.utils.sheet_to_json(wb.Sheets["Checklists"], {
  header: 1,
  defval: null,
  blankrows: false,
});

const clean = (v) => (v == null ? null : String(v).replace(/\s+/g, " ").trim() || null);
/** Título legível: parte após o traço da referência ("NR-01 – Título" -> "Título"). */
function derivarNome(ref) {
  if (!ref) return null;
  const parts = ref.split(/\s+[–—-]\s+/);
  return parts.length > 1 ? parts.slice(1).join(" – ") : ref;
}

const checklists = new Map(); // codigo -> {codigo, area, referencia, nome, itens:[]}
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  const codigo = clean(r[0]);
  const area = clean(r[1]);
  const referencia = clean(r[2]);
  const ordem = r[3];
  const texto = clean(r[4]);
  const criterio = clean(r[5]);
  if (!codigo) continue;
  if (!checklists.has(codigo)) {
    checklists.set(codigo, { codigo, area, referencia, nome: derivarNome(referencia), itens: [] });
  }
  if (texto && ordem != null) {
    checklists.get(codigo).itens.push({ ordem: Number(ordem), texto, criterio });
  }
}

// ---------- geração do SQL ----------
const q = (v) => (v == null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const lines = [];
lines.push("-- ============================================================");
lines.push("-- FieldCheck · Migration 0005 — Seed do catálogo padrão");
lines.push("-- GERADO AUTOMATICAMENTE por scripts/gen-seed.mjs — não editar à mão.");
lines.push("-- Fonte: Programa_Inspecoes_Canteiro.xlsx (aba Checklists).");
lines.push(`-- ${checklists.size} checklists / ${[...checklists.values()].reduce((s, c) => s + c.itens.length, 0)} itens. empresa_id = NULL (catálogo do sistema).`);
lines.push("-- Idempotente: UUIDs determinísticos + ON CONFLICT (id) DO UPDATE.");
lines.push("-- ============================================================");
lines.push("begin;");
lines.push("");

const ckValues = [];
const itValues = [];
for (const c of checklists.values()) {
  const ckId = uuidv5(`checklist:${c.codigo}`);
  ckValues.push(
    `  ('${ckId}', null, ${q(c.codigo)}, ${q(c.area)}, ${q(c.referencia)}, ${q(c.nome)}, 1, true)`,
  );
  for (const it of c.itens) {
    const itId = uuidv5(`item:${c.codigo}#${it.ordem}`);
    itValues.push(
      `  ('${itId}', '${ckId}', ${it.ordem}, ${q(it.texto)}, ${q(it.criterio)})`,
    );
  }
}

lines.push("insert into public.checklists (id, empresa_id, codigo, area, referencia, nome, versao, ativo) values");
lines.push(ckValues.join(",\n") + "");
lines.push("on conflict (id) do update set");
lines.push("  area = excluded.area, referencia = excluded.referencia,");
lines.push("  nome = excluded.nome, ativo = true;");
lines.push("");
lines.push("insert into public.itens_checklist (id, checklist_id, ordem, texto, criterio) values");
lines.push(itValues.join(",\n") + "");
lines.push("on conflict (id) do update set");
lines.push("  ordem = excluded.ordem, texto = excluded.texto, criterio = excluded.criterio;");
lines.push("");
lines.push("commit;");
lines.push("");

const outPath = join(__dirname, "..", "supabase", "migrations", "0005_seed_catalogo.sql");
writeFileSync(outPath, lines.join("\n"), "utf8");

// resumo p/ conferência
console.error(`checklists: ${checklists.size} | itens: ${itValues.length}`);
console.error("codigo   itens  nome");
for (const c of checklists.values()) {
  console.error(c.codigo.padEnd(8), String(c.itens.length).padStart(3), " ", c.nome);
}
console.error(`\n-> ${outPath}`);
