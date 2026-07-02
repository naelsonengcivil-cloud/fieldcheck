import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Falha cedo e claro em vez de erros obscuros de rede mais adiante.
  throw new Error(
    "Supabase não configurado: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env",
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
