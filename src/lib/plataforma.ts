import { Capacitor } from "@capacitor/core";

// ============================================================
// Camada de plataforma: usa recursos nativos via Capacitor quando
// empacotado (iOS/Android) e cai para APIs web no PWA. Os plugins são
// importados sob demanda (dynamic import) para não pesar o bundle web.
// ============================================================

export const ehNativo = (): boolean => Capacitor.isNativePlatform();

function blobParaBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("falha ao ler blob"));
    r.readAsDataURL(blob);
  });
}

/** Compartilha/salva um arquivo: Capacitor Share (nativo) ou Web Share/download. */
export async function compartilharArquivo(blob: Blob, nome: string): Promise<void> {
  if (ehNativo()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import("@capacitor/filesystem"),
      import("@capacitor/share"),
    ]);
    const base64 = await blobParaBase64(blob);
    const escrito = await Filesystem.writeFile({
      path: nome,
      data: base64,
      directory: Directory.Cache,
    });
    await Share.share({ title: nome, url: escrito.uri });
    return;
  }
  // Web: Web Share API (arquivos) → fallback download.
  try {
    const file = new File([blob], nome, { type: blob.type });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: nome });
      return;
    }
  } catch {
    /* cancelado/sem suporte → download */
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Observa o status de rede. Retorna função de limpeza. Chama onChange já com o estado atual. */
export async function observarRede(
  onChange: (online: boolean) => void,
): Promise<() => void> {
  if (ehNativo()) {
    const { Network } = await import("@capacitor/network");
    const status = await Network.getStatus();
    onChange(status.connected);
    const handle = await Network.addListener("networkStatusChange", (s) =>
      onChange(s.connected),
    );
    return () => void handle.remove();
  }
  const on = () => onChange(true);
  const off = () => onChange(false);
  window.addEventListener("online", on);
  window.addEventListener("offline", off);
  onChange(typeof navigator === "undefined" ? true : navigator.onLine);
  return () => {
    window.removeEventListener("online", on);
    window.removeEventListener("offline", off);
  };
}

/** Geolocalização: plugin nativo (Capacitor) quando empacotado; navigator no web. */
export async function obterLocalizacao(): Promise<{ lat: number | null; lng: number | null }> {
  if (ehNativo()) {
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      const pos = await Geolocation.getCurrentPosition({ timeout: 4000, maximumAge: 60_000 });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      return { lat: null, lng: null };
    }
  }
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ lat: null, lng: null });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve({ lat: null, lng: null }),
      { timeout: 4000, maximumAge: 60_000 },
    );
  });
}

/** Ajustes de inicialização no app nativo (status bar + esconder splash). No web é no-op. */
export async function inicializarNativo(): Promise<void> {
  if (!ehNativo()) return;
  try {
    const [{ StatusBar, Style }, { SplashScreen }] = await Promise.all([
      import("@capacitor/status-bar"),
      import("@capacitor/splash-screen"),
    ]);
    await StatusBar.setStyle({ style: Style.Dark }); // texto claro sobre o header navy
    await StatusBar.setBackgroundColor({ color: "#1C2733" });
    await SplashScreen.hide();
  } catch {
    /* plugin ausente/sem suporte — ignora */
  }
}

/** Captura foto pela câmera nativa (Capacitor Camera). Retorna null no web. */
export async function capturarFotoNativa(): Promise<Blob | null> {
  if (!ehNativo()) return null;
  const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
  const foto = await Camera.getPhoto({
    resultType: CameraResultType.Uri,
    source: CameraSource.Camera,
    quality: 90,
  });
  if (!foto.webPath) return null;
  const resp = await fetch(foto.webPath);
  return await resp.blob();
}
