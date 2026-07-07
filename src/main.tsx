import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "@/App";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { SyncProvider } from "@/features/sync/SyncProvider";
import { inicializarNativo } from "@/lib/plataforma";
import "@/index.css";

// Ajustes nativos (status bar + esconder splash). No-op no PWA web.
void inicializarNativo();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Offline-first: dados locais (Dexie) são a fonte durante a inspeção;
      // rede é best-effort. Evita refetch agressivo em campo.
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SyncProvider>
          <App />
        </SyncProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
