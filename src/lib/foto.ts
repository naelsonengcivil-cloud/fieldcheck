// ============================================================
// Compressão de foto no aparelho (ESPECIFICACAO.md §6):
//  - upload: máx. 1280px, JPEG q=0,7
//  - miniatura local: 480px (preview na UI)
// Reduz no cliente antes de subir (RF06 / economia de dados em campo).
// ============================================================

export interface FotoProcessada {
  /** Blob JPEG ~1280px q0.7 — vai para o Storage pela fila de sync. */
  blob: Blob;
  /** Data URL ~480px — preview leve na UI (não persistido). */
  preview: string;
}

function redimensionar(
  img: HTMLImageElement,
  max: number,
): HTMLCanvasElement {
  const escala = Math.min(1, max / Math.max(img.width, img.height));
  const cv = document.createElement("canvas");
  cv.width = Math.round(img.width * escala);
  cv.height = Math.round(img.height * escala);
  cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
  return cv;
}

function canvasParaBlob(cv: HTMLCanvasElement, q: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    cv.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("falha ao gerar JPEG"))),
      "image/jpeg",
      q,
    );
  });
}

/** Recomprime menor (para retry após 413): lado maior ≤ max, q menor. */
export async function recomprimirMenor(file: Blob, max = 1024, q = 0.55): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("imagem inválida"));
      i.src = url;
    });
    return await canvasParaBlob(redimensionar(img, max), q);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function processarFoto(file: Blob): Promise<FotoProcessada> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("imagem inválida"));
      i.src = url;
    });
    const blob = await canvasParaBlob(redimensionar(img, 1280), 0.7);
    const preview = redimensionar(img, 480).toDataURL("image/jpeg", 0.6);
    return { blob, preview };
  } finally {
    URL.revokeObjectURL(url);
  }
}
