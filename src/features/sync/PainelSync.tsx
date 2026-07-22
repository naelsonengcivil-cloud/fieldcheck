import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Botao, Card, Header } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { db } from "@/lib/db";
import { useSync } from "@/features/sync/SyncProvider";
import { coletarPendencias, tentarItem, descartarItem, type ItemFila } from "@/lib/sync";
import { traduzErroSync, rotuloOperacao } from "@/lib/syncErros";

// ============================================================
// Painel "Pendências de sincronização" (Entrega C) — lista os itens da fila
// (pendentes e com erro) com diagnóstico e ações: Tentar novamente / Descartar.
// ============================================================

export function PainelSync({ onBack }: { onBack: () => void }) {
  const { sincronizarAgora } = useSync();
  const itens = useLiveQuery(() => coletarPendencias(db), [], [] as ItemFila[]);
  const obras = useLiveQuery(() => db.obras.toArray(), [], []);
  const nomeObra = useMemo(() => new Map(obras.map((o) => [o.id, o.nome])), [obras]);
  const [descartar, setDescartar] = useState<ItemFila | null>(null);

  const referencia = (it: ItemFila) => {
    const partes = [
      it.obra_id ? nomeObra.get(it.obra_id) : null,
      it.descricao ? it.descricao.slice(0, 60) : null,
    ].filter(Boolean);
    return partes.join(" · ") || "—";
  };

  async function tentar(it: ItemFila) {
    await tentarItem(db, it.tabela, it.id);
    void sincronizarAgora();
  }
  async function confirmarDescarte() {
    if (!descartar) return;
    const { label } = rotuloOperacao(descartar.tabela);
    await descartarItem(db, descartar, label, referencia(descartar));
    setDescartar(null);
    void sincronizarAgora();
  }
  async function tentarTodos() {
    for (const it of itens) await tentarItem(db, it.tabela, it.id);
    void sincronizarAgora();
  }

  return (
    <div>
      <Header titulo="Pendências de sincronização" sub={`${itens.length} item(ns) na fila`} onBack={onBack} />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        {itens.length === 0 ? (
          <Card><div style={{ fontSize: 14, color: T.green, fontWeight: 600 }}>✓ Tudo sincronizado — nada na fila.</div></Card>
        ) : (
          <>
            <Botao variante="fantasma" onClick={() => void tentarTodos()}>↻ Tentar todos novamente</Botao>
            {itens.map((it) => {
              const op = rotuloOperacao(it.tabela);
              const erro = it.status === "erro";
              const t = erro ? traduzErroSync(it.ultimo_status_http, it.ultimo_erro) : null;
              return (
                <Card key={`${it.tabela}:${it.id}`} style={{ borderLeft: `5px solid ${erro ? T.red : T.yellow}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: T.navy }}>{op.icone} {op.label}</span>
                    <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: erro ? T.redBg : "#FFF4D6", color: erro ? T.red : T.yellowDark }}>
                      {erro ? "Erro" : "Pendente"}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: T.ink, marginTop: 4 }}>{referencia(it)}</div>
                  <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 2 }}>
                    {it.criado_em ? `Criado ${new Date(it.criado_em).toLocaleString("pt-BR")}` : ""}
                  </div>

                  {erro && t && (
                    <div style={{ marginTop: 8, background: T.redBg, borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ fontSize: 13, color: T.red, fontWeight: 600, lineHeight: 1.45 }}>{t.amigavel}</div>
                      <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 3 }}>
                        {t.tecnico} · {it.tentativas} tentativa(s)
                        {it.ultima_tentativa_em ? ` · última ${new Date(it.ultima_tentativa_em).toLocaleString("pt-BR")}` : ""}
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                    <button onClick={() => void tentar(it)} style={acaoBtn(T.navy)}>↻ Tentar novamente</button>
                    <button onClick={() => setDescartar(it)} style={acaoBtn(T.red)}>🗑 Descartar</button>
                  </div>
                </Card>
              );
            })}
          </>
        )}
      </div>

      {descartar && (
        <div onClick={() => setDescartar(null)} style={{ position: "fixed", inset: 0, background: "rgba(28,39,51,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: T.card, borderRadius: 16, padding: 20, width: "100%", maxWidth: 420 }}>
            <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 17, color: T.red, marginBottom: 8 }}>🗑 Descartar da fila?</div>
            <div style={{ fontSize: 14, color: T.ink, lineHeight: 1.55, marginBottom: 14 }}>
              Este registro feito em campo será perdido permanentemente. Deseja mesmo descartar?
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Botao onClick={() => void confirmarDescarte()}>Descartar</Botao>
              <button onClick={() => setDescartar(null)} style={{ background: "none", border: "none", color: T.inkSoft, fontWeight: 600, fontSize: 13.5, cursor: "pointer", padding: 6 }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const acaoBtn = (cor: string) =>
  ({ background: "none", border: `1px solid ${cor}`, color: cor, fontWeight: 700, fontSize: 12.5, cursor: "pointer", borderRadius: 8, padding: "6px 10px" }) as const;
