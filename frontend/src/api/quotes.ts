/**
 * Quotes-API: Lädt oder erstellt Sprüche für die Lobby-Startseite.
 */
import { DEFAULT_API_BASE_URL, parseJson } from "./http";
import type { Quote } from "./types";

const API_BASE = DEFAULT_API_BASE_URL;

/** Liefert alle Sprüche sortiert vom Backend. */
export async function listQuotes(): Promise<Quote[]> {
  const res = await fetch(`${API_BASE}/quotes`);
  return parseJson(res);
}

/** Erzeugt einen neuen Spruch (verwaltet z. B. von Admin-Tools). */
export async function createQuote(text: string): Promise<Quote> {
  const res = await fetch(`${API_BASE}/quotes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return parseJson(res);
}
