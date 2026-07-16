import { useRef } from "react";
import { Botao } from "@/components/ui";
import { processarFoto } from "@/lib/foto";
import { extrairExif, temExif } from "@/lib/exif";
import { capturarFotoNativa, capturarFotosGaleriaNativa } from "@/lib/plataforma";
import type { FotoLocal } from "@/lib/inspecaoService";

// ============================================================
// Captura de foto com DUAS origens (melhoria B): câmera e galeria.
// Nativo: Camera.getPhoto (câmera) / Camera.pickImages (galeria multi).
// Web/PWA: input capture="environment" (câmera) / input multiple (galeria).
// Ao importar da galeria, extrai EXIF (data/GPS) do arquivo ORIGINAL antes da
// compressão (que remove o EXIF). Respeita o `restante` de fotos do registro.
// ============================================================

export function CapturaFoto({
  restante,
  onFotos,
  disabled,
}: {
  restante: number; // vagas disponíveis (MAX_FOTOS - já capturadas)
  onFotos: (fotos: FotoLocal[]) => void;
  disabled?: boolean;
}) {
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);

  async function processar(files: Blob[], origem: "camera" | "galeria") {
    const sel = files.slice(0, Math.max(0, restante));
    const fotos: FotoLocal[] = [];
    for (const f of sel) {
      const exif = origem === "galeria" ? await extrairExif(f) : null;
      const { blob, preview } = await processarFoto(f);
      fotos.push({ blob, preview, exif: temExif(exif) ? exif : null });
    }
    if (fotos.length) onFotos(fotos);
  }

  async function tirar() {
    try {
      const nativa = await capturarFotoNativa();
      if (nativa) return void (await processar([nativa], "camera"));
    } catch {
      return; // usuário cancelou a câmera nativa
    }
    camRef.current?.click(); // web
  }

  async function daGaleria() {
    try {
      const nativas = await capturarFotosGaleriaNativa(restante);
      if (nativas) return void (await processar(nativas, "galeria"));
    } catch {
      return; // usuário cancelou a galeria nativa
    }
    galRef.current?.click(); // web
  }

  const bloqueado = disabled || restante <= 0;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void processar([f], "camera");
          e.target.value = "";
        }}
      />
      <input
        ref={galRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          const fs = Array.from(e.target.files ?? []);
          if (fs.length) void processar(fs, "galeria");
          e.target.value = "";
        }}
      />
      <Botao variante="fantasma" onClick={() => void tirar()} disabled={bloqueado}>
        📷 Tirar foto
      </Botao>
      <Botao variante="fantasma" onClick={() => void daGaleria()} disabled={bloqueado}>
        🖼 Galeria
      </Botao>
    </div>
  );
}
