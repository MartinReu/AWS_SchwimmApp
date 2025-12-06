/**
 * HTTP-Basiswerte fuer das Frontend-API.
 * Stellt eine konsistente Base-URL sowie einen Fetch-Helper bereit, der Fehlermeldungen ausliest.
 */
export const DEFAULT_API_BASE_URL = normalizeBaseUrl(
  (import.meta.env.VITE_API_URL || "").trim() || inferApiBaseUrl()
);

/** Gemeinsamer Fetch-Helper, der Fehlertexte parst bevor er eine Exception wirft. */
export async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      const text = await res.text().catch(() => "");
      if (text) message = text;
    }
    const error = new Error(message) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  return res.json() as Promise<T>;
}

function inferApiBaseUrl(): string {
  // Fallback nutzt die Host-IP des Browsers (z. B. Smartphone im WLAN) und greift auf den lokalen Backend-Port 4000 zu.
  if (typeof window !== "undefined" && window.location?.hostname) {
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    return `${protocol}//${window.location.hostname}:4000`;
  }
  return "http://localhost:4000";
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}
