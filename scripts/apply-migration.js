// Aplica uma migração .sql no banco Supabase via conexão direta (Session pooler).
// Uso: node scripts/apply-migration.js caminho/para/arquivo.sql
//
// Lê SUPABASE_DB_URL do ambiente ou do .env (NUNCA imprime o valor). Roda o
// arquivo inteiro dentro de UMA transação (BEGIN/COMMIT; ROLLBACK em erro).
// Útil para migrações grandes que não passam pelo SQL Editor do painel.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- carrega SUPABASE_DB_URL sem expor o valor -------------------------------
function lerConnString() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  const envPath = path.join(__dirname, "..", ".env");
  if (fs.existsSync(envPath)) {
    for (const linha of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = linha.match(/^\s*SUPABASE_DB_URL\s*=\s*(.*)\s*$/);
      if (m) {
        let v = m[1].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        return v;
      }
    }
  }
  return null;
}

async function main() {
  const arquivo = process.argv[2];
  if (!arquivo) {
    console.error("Uso: node scripts/apply-migration.js <arquivo.sql>");
    process.exit(1);
  }
  const abs = path.resolve(arquivo);
  if (!fs.existsSync(abs)) {
    console.error(`Arquivo não encontrado: ${arquivo}`);
    process.exit(1);
  }

  const connectionString = lerConnString();
  if (!connectionString) {
    console.error(
      "SUPABASE_DB_URL não definida (nem no ambiente, nem no .env). " +
        "Adicione a connection string do Session pooler ao .env e rode de novo.",
    );
    process.exit(1);
  }

  const sql = fs.readFileSync(abs, "utf8");
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
  } catch (e) {
    console.error(`Falha ao conectar ao banco: ${e.message}`);
    process.exit(1);
  }

  const nome = path.basename(arquivo);
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log(`✅ Migração aplicada com sucesso: ${nome}`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`❌ Erro ao aplicar ${nome} — rollback executado.`);
    console.error(`   ${e.message}`);
    if (e.position) console.error(`   (posição no SQL: ${e.position})`);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main();
