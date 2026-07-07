import { describe, it, expect } from "vitest";
import type { Notificacao } from "@/types/db";
import { contarNaoLidas, iconeTipo, acaoTipo } from "@/lib/notificacoesView";

function n(id: string, lida: boolean): Notificacao {
  return {
    id,
    empresa_id: "e",
    usuario_id: "u",
    tipo: "nc_atribuida",
    titulo: "t",
    corpo: null,
    evento_id: null,
    lida_em: lida ? "2026-07-07T00:00:00Z" : null,
    criado_em: "2026-07-07T00:00:00Z",
  };
}

describe("contarNaoLidas", () => {
  it("conta só as sem lida_em", () => {
    expect(contarNaoLidas([n("a", false), n("b", true), n("c", false)])).toBe(2);
    expect(contarNaoLidas([])).toBe(0);
    expect(contarNaoLidas([n("a", true)])).toBe(0);
  });
});

describe("iconeTipo / acaoTipo", () => {
  it("mapeia cada tipo", () => {
    expect(iconeTipo("nc_atribuida")).toBe("🚩");
    expect(iconeTipo("nc_aguardando_aprovacao")).toBe("⏳");
    expect(acaoTipo("nc_aguardando_aprovacao")).toBe("aprovar");
    expect(acaoTipo("nc_aprovada")).toBe("ver");
  });
});
