import exifr from "exifr";

// ============================================================
// Extração de metadados EXIF (melhoria B): data de captura + GPS.
// Lido do arquivo ORIGINAL (a compressão em canvas remove o EXIF), como
// REFORÇO probatório em registro retroativo. Tolerante: sem EXIF ou erro →
// tudo null (metadado é reforço, não requisito).
// ============================================================

export interface ExifFoto {
  capturadaEm: string | null; // ISO da captura original (DateTimeOriginal)
  lat: number | null;
  lng: number | null;
}

const VAZIO: ExifFoto = { capturadaEm: null, lat: null, lng: null };

export async function extrairExif(file: Blob): Promise<ExifFoto> {
  try {
    const out = await exifr.parse(file, { tiff: true, exif: true, gps: true });
    if (!out) return VAZIO;
    const dto: unknown = out.DateTimeOriginal ?? out.CreateDate ?? null;
    const capturadaEm =
      dto instanceof Date && !Number.isNaN(dto.getTime()) ? dto.toISOString() : null;
    const lat = typeof out.latitude === "number" ? out.latitude : null;
    const lng = typeof out.longitude === "number" ? out.longitude : null;
    return { capturadaEm, lat, lng };
  } catch {
    return VAZIO;
  }
}

/** true quando há algum metadado aproveitável. */
export function temExif(e: ExifFoto | null | undefined): boolean {
  return !!e && (!!e.capturadaEm || e.lat != null || e.lng != null);
}
