/**
 * Mock-Backend für die Schwimm-App.
 * Dieser Express-Server wird von der lokalen Vite-Frontend-App konsumiert, um Lobby-, Runden- und Leaderboard-Daten bereitzustellen.
 * Dient als In-Memory-Ersatz für echte Services, damit sich das Frontend über REST-Endpunkte mit realistischen Szenarien verbinden kann.
 */
// Framework- und Utility-Importe -------------------------------------------------
// express: HTTP-Routing, cors: Browser-Zugriffe erlauben, nanoid: kurze IDs, dotenv: .env laden
import express from "express";
import cors from "cors";
import { nanoid } from "nanoid";
import dotenv from "dotenv";
dotenv.config();

// Grundkonfiguration ----------------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json());
const PORT = Number(process.env.PORT || 4000);
const MAX_PORT_RETRY = 10;

const MAX_LOBBY_NAME = 22;
const MAX_PLAYER_NAME = 18;
const MAX_PLAYERS_PER_LOBBY = 8;
const IDEMPOTENT_JOIN = String(process.env.IDEMPOTENT_JOIN || "").toLowerCase() === "true";
const LOBBY_FULL_MESSAGE = "Lobby ist voll (max. 8 Spieler). Rejoin nur möglich, wenn dein Name inaktiv ist.";
const NAME_ACTIVE_MESSAGE = "Dieser Name ist bereits aktiv angemeldet.";
const NAME_TAKEN_MESSAGE = "Name existiert bereits in dieser Lobby.";
const SSE_RETRY_MS = 8000;
const SSE_HEARTBEAT_MS = 15000;
const SESSION_TAKEN_OVER_MESSAGE = "Session wurde von einem anderen Login übernommen.";
const LOBBY_FULL_MESSAGE_CLEAN = "Lobby ist voll (max. 8 Spieler).";

const db = {
  // In-Memory-"Datenbank" mit einfachen Arrays pro Tabelle
  lobbies: /** @type {Array<{id:string,name:string,createdAt:string,status:"open"|"active"|"closed"}>} */([]),
  players: /** @type {Array<{id:string,name:string,lobbyId:string|null,joinedAt:string,isActive?:boolean,sessionId?:string|null,lastSeen?:string,lastLobbyId?:string|null}>} */([]),
  quotes: /** @type {Array<{id:string,text:string,createdAt:string}>} */([]),
  rounds: /** @type {Array<{id:string,lobbyId:string,number:number,state:"running"|"finished",winnerPlayerId?:string|null,createdAt:string,endedAt?:string|null}>} */([]),
  lives:  /** @type {Array<{id:string,roundId:string,playerId:string,livesRemaining:number,updatedAt:string}>} */([]),
  scores: /** @type {Array<{playerId:string,pointsTotal:number}>} */([]),
};
/** Liste aller aktiven SSE-Verbindungen (per Lobby/Topic filterbar). */
const sseClients = [];

// Hilfsfunktionen für konsistente Werte ---------------------------------------
/**
 * Liefert den Zeitpunkt als ISO-Zeichenkette,
 * damit alle Zeitfelder im Speicher konsistent formatiert sind und leicht verglichen werden können.
 */
function now(){ return new Date().toISOString(); }
/**
 * Normalisiert Texteingaben (z. B. Lobby- oder Spielernamen),
 * indem überflüssige Leerzeichen entfernt und Mehrfach-Whitespace reduziert wird.
 */
function normLine(s){ return String(s ?? "").replace(/\s+/g," ").trim(); }

// Schnelle Lookup-Utilities damit der Routen-Code lesbarer bleibt
/**
 * Sucht eine Lobby anhand der ID innerhalb der In-Memory-Struktur
 * und liefert das komplette Objekt zurück, damit die Routen keine Filter-Logik duplizieren müssen.
 */
const findLobby = (id) => db.lobbies.find(l=>l.id===id);
/**
 * Sucht eine Lobby anhand des sichtbaren Namens.
 * Erwartet einen nicht-leeren String, normalized Namen intern und gibt null zurück, falls nichts gefunden wird.
 */
const findLobbyByName = (name) => {
  if (!name) return null;
  const normalized = normLine(name).toLowerCase();
  return db.lobbies.find((entry) => entry.name.toLowerCase() === normalized) ?? null;
};
/**
 * Liefert alle Spieler einer Lobby inkl. Default-Werten,
 * sodass jede Route sofort über aktuelle Aktivitäts-Flags und Timestamps verfügt.
 */
const listPlayers = (lobbyId) => db.players.filter((p)=>p.lobbyId===lobbyId).map(ensurePlayerDefaults);
/**
 * Gibt das Score-Objekt eines Spielers zurück und legt bei Bedarf ein neues an,
 * damit die Score-Liste niemals undefined enthält.
 */
const scoreFor = (playerId) => db.scores.find(s=>s.playerId===playerId) || (db.scores.push({playerId,pointsTotal:0}), db.scores[db.scores.length-1]);
/**
 * Ermittelt die jüngste Runde einer Lobby über die höchste Rundennummer,
 * um z. B. beim Finish-Endpunkt immer auf die aktuell laufende Runde zugreifen zu können.
 */
const currentRound = (lobbyId) => {
  const rs = db.rounds.filter(r=>r.lobbyId===lobbyId).sort((a,b)=>b.number-a.number);
  return rs[0] || null;
};

/**
 * Stellt sicher, dass ein Spielerobjekt alle erwarteten Felder besitzt (isActive, sessionId, joinedAt, lastSeen).
 * Dadurch muss später keine Null-Sicherheit pro Feld mehr implementiert werden.
 */
function ensurePlayerDefaults(player) {
  if (!player) return player;
  if (typeof player.isActive !== "boolean") player.isActive = true;
  if (typeof player.sessionId !== "string") player.sessionId = player.sessionId ?? null;
  if (typeof player.joinedAt !== "string" || !player.joinedAt) player.joinedAt = now();
  if (typeof player.lastSeen !== "string" || !player.lastSeen) player.lastSeen = now();
  return player;
}

/**
 * Prüft Session-IDs aus Requests auf leere Strings und unerwartete Typen und liefert sonst den getrimmten Wert zurück.
 * Damit wird verhindert, dass falsche Session-IDs versehentlich als gültige Tokens behandelt werden.
 */
function sanitizeSessionId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

/**
 * Formt das interne Spielerobjekt in ein öffentlich sendbares Objekt ohne Session-Infos um,
 * damit das Frontend keine sensiblen Felder erhält.
 */
function toPublicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    lobbyId: player.lobbyId,
    joinedAt: player.joinedAt,
    isActive: player.isActive !== false,
    lastSeen: player.lastSeen ?? null,
  };
}

/**
 * Vergleicht einen Spielernamen mit einer bereits normalisierten Variante,
 * um überall denselben Vergleichsmechanismus zu nutzen.
 */
function matchPlayerName(player, normalized) {
  return player.name.toLowerCase() === normalized;
}

/** Erzeugt eine eindeutige Session-ID für Spieler-Logins. */
function generateServerSessionId() {
  return nanoid(12);
}

/**
 * Liefert den letzten bekannten Life-Snapshot eines Spielers in der neuesten Runde einer Lobby.
 * Hilft Join/Resume dabei, den bestehenden Lebensstand gleich mitzuliefern.
 */
function latestLifeSnapshotForPlayer(lobbyId, playerId) {
  const round = currentRound(lobbyId);
  if (!round) return null;
  const life = db.lives.find((entry) => entry.roundId === round.id && entry.playerId === playerId);
  if (!life) return null;
  return { ...life, roundNumber: round.number };
}

function registerSseClient(res, { lobbyId, topics } = {}) {
  const id = nanoid(8);
  const topicSet = topics && topics.size ? topics : undefined;
  sseClients.push({ id, res, lobbyId: lobbyId || null, topics: topicSet });
  return () => {
    const idx = sseClients.findIndex((c) => c.id === id);
    if (idx !== -1) sseClients.splice(idx, 1);
  };
}

function broadcastSse(eventName, payload, { lobbyId, topic } = {}) {
  const data = JSON.stringify(payload ?? {});
  sseClients.forEach((client) => {
    if (client.lobbyId && lobbyId && client.lobbyId !== lobbyId) return;
    if (client.lobbyId && !lobbyId) return;
    if (client.topics && topic && !client.topics.has(topic)) return;
    client.res.write(`event: ${eventName}\n`);
    client.res.write(`data: ${data}\n\n`);
  });
}

setInterval(() => {
  sseClients.forEach((client) => {
    try {
      client.res.write(`: keep-alive ${Date.now()}\n\n`);
    } catch {
      /* Aufräum-Logik passiert im close-Handler */
    }
  });
}, SSE_HEARTBEAT_MS);
/**
 * Löscht eine Lobby inkl. aller zugehörigen Spieler, Runden, Lives und Scores.
 * Erwartet entweder eine Lobby-ID oder einen Namen und liefert das entfernte Lobby-Objekt plus Zähler zurück.
 */
function removeLobbyCascade({ lobbyId, lobbyName }) {
  let lobby = null;
  if (lobbyId) lobby = findLobby(lobbyId);
  if (!lobby && lobbyName) {
    const normalized = normLine(lobbyName).toLowerCase();
    lobby = db.lobbies.find((entry) => entry.name.toLowerCase() === normalized);
  }
  if (!lobby) return null;
  const id = lobby.id;
  const players = listPlayers(id);
  const playerIds = new Set(players.map((p) => p.id));
  const rounds = db.rounds.filter((round) => round.lobbyId === id);
  const roundIds = new Set(rounds.map((round) => round.id));
  const timestamp = now();

  db.lobbies = db.lobbies.filter((entry) => entry.id !== id);
  db.players = db.players.map((player) => {
    if (player.lobbyId !== id) return player;
    return {
      ...player,
      lobbyId: null,
      lastLobbyId: id,
      isActive: false,
      sessionId: null,
      lastSeen: timestamp,
    };
  });
  db.scores = db.scores.filter((score) => !playerIds.has(score.playerId));
  db.rounds = db.rounds.filter((round) => round.lobbyId !== id);
  db.lives = db.lives.filter((life) => !roundIds.has(life.roundId));

  broadcastSse("lobby_deleted", {
    type: "LOBBY_DELETED",
    lobbyId: lobby.id,
    lobbyName: lobby.name,
    removedPlayers: players.length,
    removedRounds: rounds.length,
    playerIds: players.map((p) => p.id),
    timestamp,
  }, { lobbyId: lobby.id, topic: "lobby" });

  return {
    lobby,
    removedPlayers: players.length,
    removedRounds: rounds.length,
  };
}

/**
 * Standardisiert API-Antworten für Delete-Operationen,
 * indem HTTP-Status und JSON-Struktur zusammengefasst werden.
 */
function buildDeleteResponse(result, res) {
  if (!result) {
    return res.status(404).json({ error: "Lobby nicht gefunden" });
  }
  return res.status(200).json({
    ok: true,
    lobbyId: result.lobby.id,
    lobbyName: result.lobby.name,
    removedPlayers: result.removedPlayers,
    removedRounds: result.removedRounds,
  });
}

/**
 * Baut eine Erfolgspayload für Join- und Rejoin-Aufrufe.
 * mode = "join" oder "rejoin"; player-Objekt muss vollständig sein.
 */
function buildJoinSuccess(player, mode, extras = {}) {
  const payload = {
    ok: true,
    mode,
    playerId: player.id,
    isActive: player.isActive !== false,
    player: toPublicPlayer(player),
    message: mode === "join" ? "Beitritt erfolgreich." : "Wieder verbunden.",
  };

  if (extras.sessionId) payload.sessionId = extras.sessionId;
  if (extras.sessionReplaced) payload.sessionReplaced = true;
  if (extras.playerLives) payload.playerLives = extras.playerLives;

  return payload;
}

/**
 * Liefert ein standardisiertes Fehlerobjekt für Join-Verletzungen (Name vergeben, Lobby voll etc.).
 */
function buildJoinError(errorCode, message) {
  return {
    ok: false,
    errorCode,
    message,
  };
}

/**
 * Kernlogik für Join/Rejoin.
 * Erwartet Lobby-Objekt, rohe Name-Eingabe und optional eine Session-ID aus dem Client,
 * führt Validierungen (Länge, Doppelbelegung, Kapazitätslimit) durch und liefert {status, payload}.
 *
 * Beispiel-Aufruf:
 * processJoinOrRejoin({ lobby, rawName: "Alice", clientSessionId: "abc123" })
 * -> { status: 201, payload: { ok: true, mode: "join", playerId: "..." } }
 */
function processJoinOrRejoin({ lobby, rawName, clientSessionId }) {
  const name = normLine(rawName);
  if (name.length < 2) {
    return {
      status: 400,
      payload: buildJoinError("UNKNOWN", "Spielername zu kurz (min. 2)."),
    };
  }
  if (name.length > MAX_PLAYER_NAME) {
    return {
      status: 400,
      payload: buildJoinError("UNKNOWN", "Spielername zu lang (max. " + MAX_PLAYER_NAME + ")."),
    };
  }

  const normalized = name.toLowerCase();
  const players = listPlayers(lobby.id);
  const existing = players.find((player) => matchPlayerName(player, normalized));
  const sanitizedSessionId = sanitizeSessionId(clientSessionId);
  const timestamp = now();

  if (existing) {
    const previousSessionId =
      typeof existing.sessionId === "string" && existing.sessionId ? existing.sessionId : null;
    const nextSessionId = sanitizedSessionId || generateServerSessionId();
    const sessionReplaced = Boolean(previousSessionId && previousSessionId !== nextSessionId);

    existing.isActive = true;
    existing.sessionId = nextSessionId;
    existing.lastSeen = timestamp;
    existing.lobbyId = lobby.id;

    const playerLives = latestLifeSnapshotForPlayer(lobby.id, existing.id);
    return {
      status: 200,
      payload: buildJoinSuccess(existing, "rejoin", {
        sessionId: nextSessionId,
        sessionReplaced,
        playerLives,
      }),
    };
  }

  const activeCount = players.filter((player) => player.isActive !== false).length;
  if (activeCount >= MAX_PLAYERS_PER_LOBBY) {
    return {
      status: 409,
      payload: buildJoinError("MAX_PLAYERS", LOBBY_FULL_MESSAGE_CLEAN),
    };
  }

  const player = {
    id: nanoid(10),
    name,
    lobbyId: lobby.id,
    joinedAt: timestamp,
    isActive: true,
    sessionId: sanitizedSessionId || generateServerSessionId(),
    lastSeen: timestamp,
  };
  db.players.push(player);
  scoreFor(player.id);
  const playerLives = latestLifeSnapshotForPlayer(lobby.id, player.id);
  return {
    status: 201,
    payload: buildJoinSuccess(player, "join", {
      sessionId: player.sessionId,
      playerLives,
    }),
  };
}

/**
 * SSE-Endpoint für Events wie LOBBY_DELETED.
 * Optionaler Query-Filter: ?lobbyId=XYZ begrenzt Events auf eine Lobby.
 */
app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  const lobbyId =
    typeof req.query?.lobbyId === "string" && req.query.lobbyId.trim()
      ? req.query.lobbyId.trim()
      : null;
  const topicsRaw = String(req.query?.topic || req.query?.topics || "").trim();
  const topics =
    topicsRaw.length > 0
      ? new Set(
          topicsRaw
            .split(",")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean)
        )
      : undefined;

  res.write(`retry: ${SSE_RETRY_MS}\n\n`);
  res.write(
    `event: connected\n` +
      `data: ${JSON.stringify({
        ok: true,
        lobbyId,
        topics: topics ? Array.from(topics) : undefined,
      })}\n\n`
  );

  const cleanup = registerSseClient(res, { lobbyId, topics });
  req.on("close", cleanup);
});
// ===== Lobbys & Spieler =====
/**
 * GET /lobbies
 * Liefert alle bekannten Lobbys (inkl. Status) sortiert nach Erstellzeit.
 * Wird im Home-/Lobby-Screen genutzt, um verfügbare Räume aufzulisten.
 */
app.get("/lobbies",(_req,res)=>{ res.json([...db.lobbies].sort((a,b)=>a.createdAt<b.createdAt?1:-1)); });
/**
 * GET /lobbies/:id
 * Gibt eine spezifische Lobby anhand ihrer ID zurück, 404 falls unbekannt.
 * Ermöglicht Detailansichten oder Datenabgleiche im Frontend.
 */
app.get("/lobbies/:id",(req,res)=>{ const l=findLobby(req.params.id); if(!l) return res.status(404).json({error:"Lobby nicht gefunden"}); res.json(l); });

/**
 * GET /players?lobbyId=XYZ
 * Erwartet die Lobby-ID als Query-Parameter und liefert eine Liste öffentlicher Spielerobjekte.
 * Wird von Lobby/Game-Views aufgerufen, um Teilnehmernamen synchron zu halten.
 */
app.get("/players",(req,res)=>{
  const lobbyId = String(req.query.lobbyId||""); if(!findLobby(lobbyId)) return res.status(404).json({error:"Lobby nicht gefunden"});
  res.json(listPlayers(lobbyId).map((player) => toPublicPlayer(player)));
});

/**
 * GET /players/all-names
 * Liefert eine eindeutige, alphabetisch sortierte Liste aller bisher bekannten Spieler:innen.
 * Dient als Basis für den Login-Autocomplete, der perspektivisch auf eine GraphQL-Query gemappt wird.
 */
app.get("/players/all-names", (_req, res) => {
  const seen = new Set();
  const names = [];
  db.players.forEach((player) => {
    const cleaned = normLine(player.name);
    if (!cleaned) return;
    const normalized = cleaned.toLowerCase();
    if (seen.has(normalized)) return;
    seen.add(normalized);
    names.push(cleaned);
  });
  names.sort((a, b) => a.localeCompare(b, "de", { sensitivity: "base" }));
  res.json({ names });
});

/**
 * POST /lobbies
 * Body: { name: string } mit Namenslänge 2-22 Zeichen.
 * Erstellt eine neue Lobby, setzt Status "open" und liefert das Objekt (201).
 */
app.post("/lobbies",(req,res)=>{
  const name=normLine(req.body?.name); 
  if(name.length<2) return res.status(400).json({error:"Name zu kurz (min. 2)"});
  if(name.length>MAX_LOBBY_NAME) return res.status(400).json({error:`Name zu lang (max. ${MAX_LOBBY_NAME})`});
  if(db.lobbies.some(l=>l.name.toLowerCase()===name.toLowerCase())) return res.status(409).json({error:"Lobbyname bereits vergeben"});
  const lobby={id:nanoid(10),name,createdAt:now(),status:"open"}; db.lobbies.push(lobby); res.status(201).json(lobby);
});

/**
 * POST /lobbies/:lobbyId/join
 * Erwartet Body { name?, playerName?, clientSessionId? }.
 * Führt processJoinOrRejoin aus, liefert bei Erfolg nur das öffentliche Spielerobjekt (für Legacy-Frontends).
 * Beispiel-Request: POST /lobbies/abc123/join { "name": "Eva", "clientSessionId": "sess-1" }
 */
app.post("/lobbies/:lobbyId/join",(req,res)=>{
  const lobbyId=req.params.lobbyId; const lobby=findLobby(lobbyId); if(!lobby) return res.status(404).json({error:"Lobby nicht gefunden"});
  const rawName = req.body?.name ?? req.body?.playerName ?? "";
  const result = processJoinOrRejoin({
    lobby,
    rawName,
    clientSessionId: req.body?.clientSessionId,
  });
  if (result.payload.ok) {
    return res.status(result.status).json({
      ...result.payload.player,
      sessionId: result.payload.sessionId,
      playerLives: result.payload.playerLives,
    });
  }
  const message = result.payload.message || "Beitreten nicht möglich.";
  return res.status(result.status).json({ error: message, errorCode: result.payload.errorCode ?? "UNKNOWN" });
});


/**
 * POST /lobbies/:lobbyId/join-or-rejoin
 * Gibt die vollständige Success-/Error-Struktur aus processJoinOrRejoin zurück,
 * damit neue Frontends detaillierte Statuscodes auswerten können.
 */
app.post("/lobbies/:lobbyId/join-or-rejoin",(req,res)=>{
  const lobbyId=req.params.lobbyId; const lobby=findLobby(lobbyId); if(!lobby) return res.status(404).json({error:"Lobby nicht gefunden"});
  const rawName = req.body?.name ?? req.body?.playerName ?? "";
  const result = processJoinOrRejoin({
    lobby,
    rawName,
    clientSessionId: req.body?.clientSessionId,
  });
  return res.status(result.status).json(result.payload);
});

/**
 * POST /lobbies/by-name/:lobbyName/join-or-rejoin
 * Selbes Verhalten wie oben, aber die Lobby wird anhand ihres Namens gesucht
 * (z. B. wenn QR-Codes oder Links nur den Anzeigenamen enthalten).
 */
app.post("/lobbies/by-name/:lobbyName/join-or-rejoin",(req,res)=>{
  const lobbyName=req.params.lobbyName; const lobby=findLobbyByName(lobbyName); if(!lobby) return res.status(404).json({error:"Lobby nicht gefunden"});
  const rawName = req.body?.name ?? req.body?.playerName ?? "";
  const result = processJoinOrRejoin({
    lobby,
    rawName,
    clientSessionId: req.body?.clientSessionId,
  });
  return res.status(result.status).json(result.payload);
});

/**
 * Löscht eine Lobby anhand ihrer ID (aus URL oder Body).
 * Verwendet removeLobbyCascade, beantwortet DELETE requests mit 204 und POST requests mit JSON.
 */
const handleLobbyDeleteById = (req, res) => {
  const lobbyId = req.params.lobbyId || req.body?.lobbyId;
  if (!lobbyId) return res.status(400).json({ error: "Lobby-ID erforderlich" });
  const result = removeLobbyCascade({ lobbyId });
  if (!result) return res.status(404).json({ error: "Lobby nicht gefunden" });
  if (req.method === "DELETE") return res.status(204).end();
  return res.json({ ok: true, lobbyId: result.lobby.id, lobbyName: result.lobby.name });
};

/**
 * Variante zu handleLobbyDeleteById, aber anhand des Lobby-Namens.
 * Hilfreich für Admin-Tools, die nur über den Namen verfügen.
 */
const handleLobbyDeleteByName = (req, res) => {
  const lobbyName = req.params.lobbyName || req.body?.lobbyName;
  if (!lobbyName) return res.status(400).json({ error: "Lobby-Name erforderlich" });
  const result = removeLobbyCascade({ lobbyName });
  if (!result) return res.status(404).json({ error: "Lobby nicht gefunden" });
  if (req.method === "DELETE") return res.status(204).end();
  return res.json({ ok: true, lobbyId: result.lobby.id, lobbyName: result.lobby.name });
};

/**
 * Routing-Aliase für dieselben Delete-Handler, sodass alle Legacy-URLs weiterhin funktionieren.
 */
app.delete("/lobbies/:lobbyId", handleLobbyDeleteById);
app.post("/lobbies/:lobbyId/delete", handleLobbyDeleteById);
app.post("/lobbies/:lobbyId/hard-delete", handleLobbyDeleteById);
app.delete("/leaderboard/:lobbyId", handleLobbyDeleteById);
app.delete("/leaderboards/:lobbyId", handleLobbyDeleteById);
app.post("/leaderboard/:lobbyId/delete", handleLobbyDeleteById);
app.post("/leaderboards/:lobbyId/delete", handleLobbyDeleteById);

app.delete("/lobbies/by-name/:lobbyName", handleLobbyDeleteByName);
app.post("/lobbies/by-name/:lobbyName/delete", handleLobbyDeleteByName);
app.delete("/leaderboard/by-name/:lobbyName", handleLobbyDeleteByName);
app.delete("/leaderboards/by-name/:lobbyName", handleLobbyDeleteByName);
app.post("/leaderboard/by-name/:lobbyName/delete", handleLobbyDeleteByName);
app.post("/leaderboards/by-name/:lobbyName/delete", handleLobbyDeleteByName);

/**
 * POST-Varianten, die Body { lobbyId?, lobbyName? } akzeptieren.
 * Praktisch für Tools, die keine URL-Parameter setzen können.
 */
app.post("/lobbies/delete",(req,res)=>{
  const { lobbyId, lobbyName } = req.body || {};
  const result = removeLobbyCascade({ lobbyId, lobbyName });
  return buildDeleteResponse(result, res);
});

app.post("/leaderboard/delete",(req,res)=>{
  const { lobbyId, lobbyName } = req.body || {};
  const result = removeLobbyCascade({ lobbyId, lobbyName });
  return buildDeleteResponse(result, res);
});

app.post("/leaderboards/delete",(req,res)=>{
  const { lobbyId, lobbyName } = req.body || {};
  const result = removeLobbyCascade({ lobbyId, lobbyName });
  return buildDeleteResponse(result, res);
});

// ===== Sprüche =====
/**
 * GET /quotes
 * Liefert alle Sprüche (neuste zuerst). Frontend nutzt dies z. B. zur Anzeige zwischen Runden.
 * Antwortformat: [{ id, text, createdAt }]
 */
app.get("/quotes",(_req,res)=>{ res.json([...db.quotes].sort((a,b)=>a.createdAt<b.createdAt?1:-1)); });
/**
 * POST /quotes
 * Body: { text } (5-220 Zeichen, Whitespace wird normalisiert).
 * Speichert den Spruch und gibt ihn mit ID+Timestamp zurück.
 */
app.post("/quotes",(req,res)=>{ const text=normLine(req.body?.text); if(text.length<5) return res.status(400).json({error:"Spruch zu kurz"}); if(text.length>220) return res.status(400).json({error:"Spruch zu lang (max. 220)"});
  const q={id:nanoid(10),text,createdAt:now()}; db.quotes.push(q); res.status(201).json(q);
});

// ===== Runden =====
/**
 * GET /rounds/current?lobbyId=XYZ
 * Liefert die letzte Runde der angegebenen Lobby plus Lives-/Score-Snapshots.
 * Das Frontend zeigt damit den aktuellen Spielstand im Game-Screen an.
 */
app.get("/rounds/current",(req,res)=>{
  const lobbyId = String(req.query.lobbyId||""); const lobby=findLobby(lobbyId);
  if(!lobby) return res.status(404).json({error:"Lobby nicht gefunden"});
  const r = currentRound(lobbyId); if(!r) return res.status(404).json({error:"Keine Runde vorhanden"});
  const lives = db.lives.filter(l=>l.roundId===r.id);
  const scores = listPlayers(lobbyId).map(p=>scoreFor(p.id));
  res.json({ round: r, lives, scores });
});

/**
 * POST /rounds/start
 * Body: { lobbyId }. Startet eine neue Runde mit fortlaufender Nummer,
 * erzeugt Lives-Einträge (4 Leben pro Spieler) und initialisiert Scores falls notwendig.
 */
app.post("/rounds/start",(req,res)=>{
  const lobbyId = String(req.body?.lobbyId||""); const lobby=findLobby(lobbyId);
  if(!lobby) return res.status(404).json({error:"Lobby nicht gefunden"});
  const prev = currentRound(lobbyId);
  const number = prev ? prev.number + 1 : 1;
  const round = { id:nanoid(12), lobbyId, number, state:"running", winnerPlayerId:null, createdAt:now(), endedAt:null };
  db.rounds.push(round);
  const players = listPlayers(lobbyId);
  players.forEach(p=>{
    db.lives.push({ id:nanoid(12), roundId: round.id, playerId: p.id, livesRemaining: 4, updatedAt: now() });
    scoreFor(p.id);
  });
  res.status(201).json({ round, lives: db.lives.filter(l=>l.roundId===round.id) });
});

/**
 * PATCH /rounds/:roundId/life
 * Body: { playerId, livesRemaining }
 * Aktualisiert die verbleibenden Leben eines Spielers in dieser Runde (0-4).
 */
app.patch("/rounds/:roundId/life",(req,res)=>{
  const roundId=req.params.roundId; const r=db.rounds.find(x=>x.id===roundId);
  if(!r) return res.status(404).json({error:"Runde nicht gefunden"}); if(r.state!=="running") return res.status(409).json({error:"Runde bereits beendet"});
  const playerId=String(req.body?.playerId||""); const livesRemaining=Number(req.body?.livesRemaining);
  const clientSessionId = sanitizeSessionId(req.body?.clientSessionId);
  const player = db.players.find(p=>p.id===playerId);
  if(!player) return res.status(404).json({error:"Spieler nicht gefunden"});
  const storedSessionId = sanitizeSessionId(player.sessionId);
  if(storedSessionId && clientSessionId && storedSessionId!==clientSessionId) return res.status(409).json({error:SESSION_TAKEN_OVER_MESSAGE,errorCode:"SESSION_STALE"});
  if(storedSessionId && !clientSessionId) return res.status(409).json({error:SESSION_TAKEN_OVER_MESSAGE,errorCode:"SESSION_STALE"});
  player.lastSeen = now();
  if(!Number.isInteger(livesRemaining) || livesRemaining<0 || livesRemaining>4) return res.status(400).json({error:"Ungültiger Leben-Wert"});
  const ls = db.lives.find(x=>x.roundId===roundId && x.playerId===playerId); if(!ls) return res.status(404).json({error:"LifeState nicht gefunden"});
  ls.livesRemaining = livesRemaining; ls.updatedAt = now(); res.json(ls);
});


/**
 * POST /rounds/:roundId/finish
 * Body: { winnerPlayerId }
 * Markiert die Runde als beendet, speichert Gewinner und erhöht dessen Score.
 */
app.post("/rounds/:roundId/finish",(req,res)=>{
  const roundId=req.params.roundId; const r=db.rounds.find(x=>x.id===roundId);
  if(!r) return res.status(404).json({error:"Runde nicht gefunden"});
  if(r.state==="finished") return res.status(409).json({error:"Runde bereits beendet"});
  const winnerPlayerId = String(req.body?.winnerPlayerId||"");
  const clientSessionId = sanitizeSessionId(req.body?.clientSessionId);
  const winner = db.players.find(p=>p.id===winnerPlayerId);
  if(!winner) return res.status(404).json({error:"Gewinner-Spieler nicht gefunden"});
  const storedSessionId = sanitizeSessionId(winner.sessionId);
  if(storedSessionId && clientSessionId && storedSessionId!==clientSessionId) return res.status(409).json({error:SESSION_TAKEN_OVER_MESSAGE,errorCode:"SESSION_STALE"});
  if(storedSessionId && !clientSessionId) return res.status(409).json({error:SESSION_TAKEN_OVER_MESSAGE,errorCode:"SESSION_STALE"});
  winner.lastSeen = now();
  r.state="finished"; r.winnerPlayerId=winnerPlayerId; r.endedAt=now();
  scoreFor(winnerPlayerId).pointsTotal += 1;
  const scores = listPlayers(r.lobbyId).map(p=>scoreFor(p.id));
  broadcastSse("round_finished", {
    type: "ROUND_FINISHED",
    lobbyId: r.lobbyId,
    roundId: r.id,
    round: r,
    scores,
  }, { lobbyId: r.lobbyId, topic: "round" });
  res.json({ round: r, scores });
});


// ===== Leaderboard (aggregiert alle Lobbys + Spielerstände) =====
/**
 * GET /leaderboard
 * Query: search/query (String), limit, offset.
 * Aggregiert alle Lobbys inkl. zugehöriger Spieler und deren Punkte für die Anzeige im Leaderboard-Screen.
 */
app.get("/leaderboard",(req,res)=>{
  const search = normLine(req.query.search ?? req.query.query ?? "");
  const limit = Number(req.query.limit);
  const offset = Number(req.query.offset) || 0;
  const searchLower = search.toLowerCase();

  let list = db.lobbies
    .filter(lobby => !searchLower || lobby.name.toLowerCase().includes(searchLower))
    .map(lobby => {
      const players = listPlayers(lobby.id).map(player => {
        const score = scoreFor(player.id);
        return {
          id: player.id,
          name: player.name,
          points: score.pointsTotal,
          pointsTotal: score.pointsTotal,
          isActive: player.isActive !== false,
        };
      });
      const rounds = db.rounds.filter(r => r.lobbyId === lobby.id && r.state === "finished").length;
      return {
        id: lobby.id,
        lobbyId: lobby.id,
        name: lobby.name,
        lobbyName: lobby.name,
        createdAt: lobby.createdAt,
        rounds,
        players,
      };
    })
    .sort((a,b)=>a.createdAt<b.createdAt?1:-1);

  if (!Number.isNaN(offset) && offset > 0) {
    list = list.slice(offset);
  }
  if (!Number.isNaN(limit) && limit > 0) {
    list = list.slice(0, limit);
  }

  res.json(list);
});

// Healthcheck-Endpoint für schnelle Verfügbarkeitsprüfung
app.get("/health",(_req,res)=>res.json({ok:true,time:now()}));

function startServer(port, attempt = 1) {
  const server = app.listen(port, () =>
    console.log(`Mock backend listening on http://localhost:${port} (IDEMPOTENT_JOIN=${IDEMPOTENT_JOIN})`)
  );

  server.on("error", (err) => {
    if (err && err.code === "EADDRINUSE" && attempt < MAX_PORT_RETRY) {
      const next = port + 1;
      console.warn(`Port ${port} belegt, versuche ${next}...`);
      return startServer(next, attempt + 1);
    }
    console.error("Server konnte nicht starten:", err);
    process.exit(1);
  });
}

startServer(PORT);

