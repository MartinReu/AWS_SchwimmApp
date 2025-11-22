/**
 * Zentrale Re-Exports der API-Layer.
 * `api` bietet weiterhin das alte Objektinterface, während einzelne Funktionen direkt importiert werden können.
 */
import { listLobbies, getLobby, createLobby, listPlayers, fetchAllPlayerNames } from "./lobbies";
import { listQuotes, createQuote } from "./quotes";
import { getCurrentRound, startNextRound, updateLife, finishRound } from "./game";

export * from "./lobbies";
export * from "./leaderboards";
export * from "./quotes";
export * from "./game";
export * from "./types";

export const api = {
  listLobbies,
  getLobby,
  createLobby,
  listPlayers,
  fetchAllPlayerNames,
  listQuotes,
  createQuote,
  getCurrentRound,
  startNextRound,
  updateLife,
  finishRound,
};
