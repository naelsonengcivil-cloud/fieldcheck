import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  planoVigente,
  temFeatureNaMatriz,
  planoQueInclui,
  diasDeTrial,
  extrairUpgradeHint,
  COPY_LIMITE,
  ROTULO_PLANO,
  type Tier,
  type Feature,
  type LinhaFeature,
} from "@/lib/planos";

// ============================================================
// PlanoProvider — fundação de gating no cliente (Frente 3). Busca a config
// `plan_features` (RLS-readable, uma vez) e deriva o tier da empresa logada.
// Enquanto carrega, é OTIMISTA (temFeature=true) para não piscar cadeados.
// O enforcement real é server-side; aqui é só UX (cadeado/CTA/vitrine).
//
// Também centraliza a VITRINE de upgrade: qualquer tela pede um upgrade
// (feature bloqueada) ou entrega um erro do servidor (limite de criação) e o
// modal aparece uma única vez, no topo (renderizado pelo AppShell).
// ============================================================

/** Pedido de vitrine aberto — casado com as props do ModalUpgrade. */
export interface PedidoUpgrade {
  titulo: string;
  corpo: string;
  planoAlvo: "basic" | "premium" | "intelligence" | null;
}

interface PlanoCtx {
  tier: Tier;
  carregando: boolean;
  matriz: LinhaFeature[] | null; // config plan_features crua (p/ tabela comparativa)
  temFeature: (f: Feature) => boolean;
  planoQueInclui: (f: Feature) => "basic" | "premium" | "intelligence" | null;
  diasTrial: number | null;
  // Vitrine de upgrade (centralizada).
  pedido: PedidoUpgrade | null;
  /** Abre a vitrine para uma FEATURE bloqueada (cadeado tocado). */
  pedirUpgrade: (feature: Feature, nome: string, oQueFaz: string) => void;
  /** Se o erro for de limite/plano (hint estruturado), abre a vitrine e retorna true. */
  tratarErroUpgrade: (erro: unknown) => boolean;
  fecharUpgrade: () => void;
}

const Ctx = createContext<PlanoCtx | null>(null);

export function PlanoProvider({ children }: { children: ReactNode }) {
  const { empresa } = useAuth();
  const [matriz, setMatriz] = useState<LinhaFeature[] | null>(null);
  const [pedido, setPedido] = useState<PedidoUpgrade | null>(null);

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

  const fecharUpgrade = useCallback(() => setPedido(null), []);

  const pedirUpgrade = useCallback(
    (feature: Feature, nome: string, oQueFaz: string) => {
      const alvo = matriz ? planoQueInclui(feature, matriz) : null;
      setPedido({
        titulo: nome,
        corpo: `${oQueFaz} Faça upgrade para ${alvo ? ROTULO_PLANO[alvo] : "um plano superior"} para desbloquear.`,
        planoAlvo: alvo,
      });
    },
    [matriz],
  );

  const tratarErroUpgrade = useCallback((erro: unknown): boolean => {
    const recurso = extrairUpgradeHint(erro);
    if (!recurso) return false;
    const c = COPY_LIMITE[recurso];
    setPedido({ titulo: c.nome, corpo: c.corpo, planoAlvo: c.planoAlvo });
    return true;
  }, []);

  const valor = useMemo<PlanoCtx>(
    () => ({
      tier,
      carregando: matriz === null,
      matriz,
      diasTrial: diasDeTrial(empresa),
      temFeature: (f) => (matriz === null ? true : temFeatureNaMatriz(tier, f, matriz)),
      planoQueInclui: (f) => (matriz === null ? null : planoQueInclui(f, matriz)),
      pedido,
      pedirUpgrade,
      tratarErroUpgrade,
      fecharUpgrade,
    }),
    [tier, matriz, empresa, pedido, pedirUpgrade, tratarErroUpgrade, fecharUpgrade],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function usePlano(): PlanoCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePlano fora do PlanoProvider");
  return c;
}
