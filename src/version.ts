// ============================================================
// Versão do app — fonte única exibida na UI (login, perfil).
// Mantenha em sincronia com "version" do package.json a cada release.
// ============================================================
export const APP_VERSION = "1.0.0";

/** Rótulo curto para selos discretos na interface (ex.: "v1.0"). */
export const APP_VERSION_LABEL = "v" + APP_VERSION.split(".").slice(0, 2).join(".");
