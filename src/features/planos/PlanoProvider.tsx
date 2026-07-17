import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  planoVigente,
  temFeatureNaMatriz,
  planoQueInclui,
  diasDeTrial,
  type Tier,
  type Feature,
  type LinhaFeature,
} from "@/lib/planos";

// ============================================================
// PlanoProvider — fundação de gating no cliente (Frente 3). Busca a config
// `plan_features` (RLS-readable, uma vez) e deriva o tier da empresa logada.
// Enquanto carrega, é OTIMISTA (temFeature=true) para não piscar cadeados.
// O enforcement real é server-side; aqui é só UX (cadeado/CTA/vitrine).
// ============================================================

interface PlanoCtx {
  tier: Tier;
  carregando: boolean;
  temFeature: (f: Feature) => boolean;
  planoQueInclui: (f: Feature) => "basic" | "premium" | "intelligence" | null;
  diasTrial: number | null;
}

const Ctx = createContext<PlanoCtx | null>(null);

export function PlanoProvider({ children }: { children: ReactNode }) {
  const { empresa } = useAuth();
  const [matriz, setMatriz] = useState<LinhaFeature[] | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const { data } = await supabase
        .from("plan_features")
        .select("feature, basic, premium, intelligence, descricao");
      if (vivo && data) setMatriz(data as LinhaFeature[]);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const tier = useMemo(() => planoVigente(empresa), [empresa]);

  const valor = useMemo<PlanoCtx>(
    () => ({
      tier,
      carregando: matriz === null,
      diasTrial: diasDeTrial(empresa),
      temFeature: (f) => (matriz === null ? true : temFeatureNaMatriz(tier, f, matriz)),
      planoQueInclui: (f) => (matriz === null ? null : planoQueInclui(f, matriz)),
    }),
    [tier, matriz, empresa],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function usePlano(): PlanoCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePlano fora do PlanoProvider");
  return c;
}
