import { supabase } from "@/lib/supabase";

// ============================================================
// Logo da empresa (Marco J) — bucket público 'logos'. Otimiza no cliente:
// raster vira PNG ≤480px (preserva transparência); SVG passa direto.
// Caminho: {empresa_id}/{timestamp}.{ext} — nome novo a cada troca evita
// cache velho no CDN; os arquivos antigos da pasta são removidos.
// ============================================================

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const LOGO_MAX_PX = 480;
const RASTER = ["image/png", "image/jpeg", "image/webp"];

interface LogoPreparado {
  blob: Blob;
  ext: string;
  contentType: string;
}

function carregar(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("imagem inválida"));
    i.src = url;
  });
}

/** Valida (≤2 MB, formato aceito) e otimiza o logo para upload. */
export async function prepararLogo(file: File): Promise<LogoPreparado> {
  if (file.size > MAX_BYTES) throw new Error("O arquivo excede 2 MB.");
  if (file.type === "image/svg+xml") return { blob: file, ext: "svg", contentType: file.type };
  if (!RASTER.includes(file.type)) throw new Error("Formato não suportado (use PNG, JPG, WEBP ou SVG).");

  const url = URL.createObjectURL(file);
  try {
    const img = await carregar(url);
    const escala = Math.min(1, LOGO_MAX_PX / Math.max(img.width, img.height));
    const cv = document.createElement("canvas");
    cv.width = Math.round(img.width * escala);
    cv.height = Math.round(img.height * escala);
    cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
    const blob = await new Promise<Blob>((res, rej) =>
      cv.toBlob((b) => (b ? res(b) : rej(new Error("falha ao gerar PNG"))), "image/png"),
    );
    return { blob, ext: "png", contentType: "image/png" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Remove todos os arquivos da pasta da empresa, exceto `manter` (path completo). */
async function limparPasta(empresaId: string, manter?: string): Promise<void> {
  const { data } = await supabase.storage.from("logos").list(empresaId);
  const alvos = (data ?? [])
    .map((f) => `${empresaId}/${f.name}`)
    .filter((p) => p !== manter);
  if (alvos.length) await supabase.storage.from("logos").remove(alvos);
}

/** Sobe o logo, grava empresas.logo_url e devolve a URL pública. */
export async function subirLogo(empresaId: string, file: File): Promise<string> {
  // Blindagem: sem empresa a 1ª pasta do path fica vazia e a policy do bucket
  // (pasta = empresa) nega — o que aparecia como "problema de admin".
  if (!empresaId) {
    throw new Error("Empresa não carregada. Recarregue a página e tente novamente.");
  }
  const prep = await prepararLogo(file);
  // Path único por timestamp → upsert desnecessário. Com upsert:true o Storage
  // avalia também o caminho de UPDATE no RLS e pode negar mesmo com a policy de
  // INSERT correta; INSERT puro passa. Os arquivos antigos são limpos abaixo.
  const path = `${empresaId}/${Date.now()}.${prep.ext}`;
  const up = await supabase.storage
    .from("logos")
    .upload(path, prep.blob, { contentType: prep.contentType });
  if (up.error) {
    // NÃO mascarar: a mensagem genérica de "admin" escondia a causa real do RLS
    // (sessão ausente, condição de pasta/empresa, etc.). Surface o erro + a sessão.
    const { data: sess } = await supabase.auth.getSession();
    const ctx = sess.session ? `sessão ativa (uid ${sess.session.user.id.slice(0, 8)}…)` : "SEM sessão ativa";
    throw new Error(
      `Falha ao enviar o logo — ${ctx}, pasta/empresa=${empresaId.slice(0, 8)}…. ` +
        `Detalhe do servidor: ${up.error.message}`,
    );
  }
  const { data } = supabase.storage.from("logos").getPublicUrl(path);
  await limparPasta(empresaId, path);
  const upd = await supabase.from("empresas").update({ logo_url: data.publicUrl }).eq("id", empresaId);
  if (upd.error) throw new Error("Logo enviado, mas não foi possível salvá-lo. Tente novamente.");
  return data.publicUrl;
}

/** Remove o logo da empresa (Storage + coluna). */
export async function removerLogo(empresaId: string): Promise<void> {
  await limparPasta(empresaId);
  const upd = await supabase.from("empresas").update({ logo_url: null }).eq("id", empresaId);
  if (upd.error) throw new Error("Não foi possível remover o logo.");
}
