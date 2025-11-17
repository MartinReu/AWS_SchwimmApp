/**
 * HTTP-Basiswerte für das Frontend-API.
 * Stellt eine konsistente Base-URL sowie einen Fetch-Helper bereit, der Fehlermeldungen ausliest.
 */
export const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

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
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}
