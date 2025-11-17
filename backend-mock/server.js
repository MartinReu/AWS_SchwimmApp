/**
 * Mock-Backend für die Schwimm-App.
 * Dieser Express-Server wird von der lokalen Vite-Frontend-App konsumiert, um Lobby-, Runden- und Leaderboard-Daten bereitzustellen.
 * Dient als In-Memory-Ersatz für echte Services, damit sich das Frontend über REST-Endpunkte mit realistischen Szenarien verbinden kann.
 */
// Framework / Utility Imports -------------------------------------------------
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
const PORT = process.env.PORT || 4000;

const MAX_LOBBY_NAME = 22;
const MAX_PLAYER_NAME = 18;
const MAX_PLAYERS_PER_LOBBY = 8;
const IDEMPOTENT_JOIN = String(process.env.IDEMPOTENT_JOIN || "").toLowerCase() === "true";
const LOBBY_FULL_MESSAGE = "Lobby ist voll (max. 8 Spieler). Rejoin nur möglich, wenn dein Name inaktiv ist.";
const NAME_ACTIVE_MESSAGE = "Dieser Name ist bereits aktiv angemeldet.";
const NAME_TAKEN_MESSAGE = "Name existiert bereits in dieser Lobby.";

const db = {
  // In-Memory-"Datenbank" mit einfachen Arrays pro Tabelle
  lobbies: /** @type {Array<{id:string,name:string,createdAt:string,status:"open"|"active"|"closed"}>} */([]),
  players: /** @type {Array<{id:string,name:string,lobbyId:string,joinedAt:string,isActive?:boolean,sessionId?:string|null,lastSeen?:string}>} */([]),
  quotes: /** @type {Array<{id:string,text:string,createdAt:string}>} */([]),
  rounds: /** @type {Array<{id:string,lobbyId:string,number:number,state:"running"|"finished",winnerPlayerId?:string|null,createdAt:string,endedAt?:string|null}>} */([]),
  lives:  /** @type {Array<{id:string,roundId:string,playerId:string,livesRemaining:number,updatedAt:string}>} */([]),
  scores: /** @type {Array<{playerId:string,pointsTotal:number}>} */([]),
};

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
  };
}

/**
 * Vergleicht einen Spielernamen mit einer bereits normalisierten Variante,
 * um überall denselben Vergleichsmechanismus zu nutzen.
 */
function matchPlayerName(player, normalized) {
  return player.name.toLowerCase() === normalized;
}

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

  db.lobbies = db.lobbies.filter((entry) => entry.id !== id);
  db.players = db.players.filter((player) => player.lobbyId !== id);
  db.scores = db.scores.filter((score) => !playerIds.has(score.playerId));
  db.rounds = db.rounds.filter((round) => round.lobbyId !== id);
  db.lives = db.lives.filter((life) => !roundIds.has(life.roundId));

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
function buildJoinSuccess(player, mode) {
  return {
    ok: true,
    mode,
    playerId: player.id,
    isActive: player.isActive !== false,
    player: toPublicPlayer(player),
    message: mode === "join" ? "Beitritt erfolgreich." : "Wieder verbunden.",
  };
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
      payload: buildJoinError("UNKNOWN", `Spielername zu lang (max. ${MAX_PLAYER_NAME}).`),
    };
  }

  const normalized = name.toLowerCase();
  const players = listPlayers(lobby.id);
  const existing = players.find((player) => matchPlayerName(player, normalized));
  const sanitizedSessionId = sanitizeSessionId(clientSessionId);
  const timestamp = now();

  if (existing) {
    const storedSessionId = typeof existing.sessionId === "string" && existing.sessionId ? existing.sessionId : null;
    const isActive = existing.isActive !== false;

    if (isActive) {
      // Aktive Spieler dürfen nur erneut beitreten, wenn dieselbe Session-ID verwendet wird
      // oder der Server explizit idempotente Joins erlauben soll.
      if (
        (sanitizedSessionId && storedSessionId && sanitizedSessionId === storedSessionId) ||
        (!storedSessionId && sanitizedSessionId)
      ) {
        existing.sessionId = sanitizedSessionId ?? existing.sessionId ?? null;
        existing.lastSeen = timestamp;
        existing.isActive = true;
        return { status: 200, payload: buildJoinSuccess(existing, "rejoin") };
      }
      if (!sanitizedSessionId && !storedSessionId && IDEMPOTENT_JOIN) {
        existing.lastSeen = timestamp;
        return { status: 200, payload: buildJoinSuccess(existing, "rejoin") };
      }
      return { status: 409, payload: buildJoinError("NAME_ACTIVE", NAME_ACTIVE_MESSAGE) };
    }

    if (storedSessionId && sanitizedSessionId && storedSessionId !== sanitizedSessionId) {
      // Session-IDs kollidieren: der Client hat einen alten Namen ohne passende Session erneut angefordert
      return { status: 409, payload: buildJoinError("NAME_TAKEN", NAME_TAKEN_MESSAGE) };
    }
    if (storedSessionId && !sanitizedSessionId) {
      return { status: 409, payload: buildJoinError("NAME_TAKEN", NAME_TAKEN_MESSAGE) };
    }

    existing.isActive = true;
    existing.sessionId = sanitizedSessionId ?? existing.sessionId ?? null;
    existing.lastSeen = timestamp;
    return { status: 200, payload: buildJoinSuccess(existing, "rejoin") };
  }

  // Nur aktive Spieler zählen für das Cap, damit inaktive oder getrennte Spieler Slots freigeben können
  const activeCount = players.filter((player) => player.isActive !== false).length;
  if (activeCount >= MAX_PLAYERS_PER_LOBBY) {
    return {
      status: 409,
      payload: buildJoinError("MAX_PLAYERS", LOBBY_FULL_MESSAGE),
    };
  }

  const player = {
    id: nanoid(10),
    name,
    lobbyId: lobby.id,
    joinedAt: timestamp,
    isActive: true,
    sessionId: sanitizedSessionId ?? null,
    lastSeen: timestamp,
  };
  db.players.push(player);
  scoreFor(player.id);
  return { status: 201, payload: buildJoinSuccess(player, "join") };
}

// ===== Lobby & Players =====
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
    return res.status(result.status).json(result.payload.player);
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

// ===== Quotes =====
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

// ===== Rounds =====
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
  if(!db.players.find(p=>p.id===winnerPlayerId)) return res.status(404).json({error:"Gewinner-Spieler nicht gefunden"});
  r.state="finished"; r.winnerPlayerId=winnerPlayerId; r.endedAt=now();
  scoreFor(winnerPlayerId).pointsTotal += 1;
  const scores = listPlayers(r.lobbyId).map(p=>scoreFor(p.id));
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

// Server starten und Port + Einstellung in Konsole ausgeben
app.listen(PORT,()=>console.log(`Mock backend listening on http://localhost:${PORT} (IDEMPOTENT_JOIN=${IDEMPOTENT_JOIN})`));
