import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { contarPendencias, sincronizar } from "@/lib/sync";
import { criarSupabaseSyncClient } from "@/lib/supabaseSync";
import { baixarCatalogo } from "@/lib/catalogo";
import { baixarLeitura } from "@/lib/leitura";
import { observarRede } from "@/lib/plataforma";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";

// ============================================================
// Orquestra a sincronização (§7.2): dispara ao ficar online, a cada
// 60s e sob demanda (botão manual). Expõe contagem de pendências
// (reativa, via Dexie) para o indicador visual.
// ============================================================

const INTERVALO_MS = 60_000;

interface SyncState {
  online: boolean;
  sincronizando: boolean;
  pendencias: number;
  ultimoErro: string | null;
  sincronizarAgora: () => Promise<void>;
}

const SyncContext = createContext<SyncState | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { empresa, status } = useAuth();
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [sincronizando, setSincronizando] = useState(false);
  const [ultimoErro, setUltimoErro] = useState<string | null>(null);
  const emExecucao = useRef(false);

  const pendencias =
    useLiveQuery(() => contarPendencias(db), [], 0) ?? 0;

  const sincronizarAgora = useCallback(async () => {
    // Só sincroniza logado e online; evita execuções concorrentes.
    if (emExecucao.current) return;
    if (status !== "pronto" || !empresa) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    emExecucao.current = true;
    setSincronizando(true);
    setUltimoErro(null);
    try {
      const client = criarSupabaseSyncClient(supabase, empresa.id);
      const res = await sincronizar(db, client);
      if (res.erros > 0) setUltimoErro(`${res.erros} item(ns) com erro`);
      // Atualiza o catálogo (obras/checklists/itens) e o modelo de leitura
      // (inspeções/respostas/eventos/usuários/evidências) p/ uso offline.
      try {
        await baixarCatalogo(db, supabase);
        await baixarLeitura(db, supabase);
      } catch {
        /* sem rede/tabela: mantém o cache anterior */
      }
    } catch (e) {
      setUltimoErro((e as Error)?.message ?? "Falha na sincronização");
    } finally {
      emExecucao.current = false;
      setSincronizando(false);
    }
  }, [empresa, status]);

  // Gatilhos: mudança de rede (Capacitor Network no nativo / eventos no web)
  // + intervalo de 60s + sync inicial ao logar.
  useEffect(() => {
    let anterior = online;
    const limpar = observarRede((agoraOnline) => {
      setOnline(agoraOnline);
      // dispara sync ao (re)conectar
      if (agoraOnline && !anterior) void sincronizarAgora();
      anterior = agoraOnline;
    });

    void sincronizarAgora();
    const timer = window.setInterval(() => void sincronizarAgora(), INTERVALO_MS);

    return () => {
      void limpar.then((fn) => fn());
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sincronizarAgora]);

  return (
    <SyncContext.Provider
      value={{ online, sincronizando, pendencias, ultimoErro, sincronizarAgora }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncState {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync deve ser usado dentro de <SyncProvider>");
  return ctx;
}
