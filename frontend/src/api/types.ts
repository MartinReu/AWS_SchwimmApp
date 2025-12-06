/**
 * Zentrale Typdefinitionen für Lobby/Player/Round.
 * Diese werden in API-Modulen und UI-Komponenten gemeinsam verwendet.
 */
export type Lobby = { id: string; name: string; createdAt: string; status: "open" | "active" | "closed" };
export type Player = { id: string; name: string; lobbyId: string; joinedAt: string; isActive?: boolean; lastSeen?: string | null };
export type Quote = { id: string; text: string; createdAt: string };

export type Round = {
  id: string;
  lobbyId: string;
  number: number;
  state: "running" | "finished";
  winnerPlayerId?: string | null;
  createdAt: string;
  endedAt?: string | null;
};

export type LifeState = {
  id: string;
  roundId: string;
  playerId: string;
  livesRemaining: number;
  updatedAt: string;
};

export type Score = {
  playerId: string;
  pointsTotal: number;
};
