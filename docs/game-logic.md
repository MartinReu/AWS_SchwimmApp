# Spiellogik Schwimm

## Lobby-Flow
- Eine Lobby entsteht über die Home-Seite oder automatisiert im Dev-Modus. Namen werden serverseitig bereinigt und müssen eindeutig sein.
- Jede Lobby erlaubt maximal acht gleichzeitige Spieler:innen. Der Client blockt weitere Join-Versuche und zeigt einen Hinweis, solange alle Namen aktiv sind.
- Join und Rejoin laufen über `join-or-rejoin`: Mitgegeben werden Lobby-ID oder -Name, Spielername und ein `clientSessionId`, der Browser-Tabs eindeutig markiert. Das Backend prüft anhand von Session-ID und Aktiv-Status, ob ein vorhandener Slot übernommen werden darf.
- Der Client hält eine lokale Session (`localStorage`) mit Lobby, Spielername/-ID, letztem View (Game oder Lose) und optionaler Rundennummer. Darüber funktionieren Deep-Links und der Resume-CTA.
- Anwesenheit läuft per Heartbeat (Fetch `presencePing`) alle ~12 s sowie beim Wechsel der Sichtbarkeit/Pagehide. So bleiben Slots reserviert und werden nach kurzer Abwesenheit freigegeben.

## Runden-Flow
- Nach dem Join lädt der Client die aktuelle Runde (`/rounds/current`). Existiert noch keine Runde, startet er einmalig eine neue (`/rounds/start`).
- Alle zwei Sekunden pollt der Client Lobby-, Runden- und Spielerstatus, um Lives, Scores und Gewinner zu aktualisieren. Sobald eine Runde mit Gewinner markiert wurde, navigiert die Runde automatisch auf den Win-Screen.
- Das Slider-Element „Runde beenden“ löst `finishRound` aus. Nur der ausführende Spieler meldet das Ergebnis; alle anderen sehen denselben Gewinner über den Poll.
- Der Lose-Screen prüft in 1,5 s Abständen, ob eine neue Runde angefangen wurde (Rundennummer ändert sich). Danach springt er automatisch zurück zur Game-Route.

## Leben & Visualisierung
- Pro Spieler existieren vier Zustände: drei Streichhölzer plus „Schwimmst“ (letztes Leben). Der Server verwaltet die numerische Restleben-Angabe, der Client projiziert sie auf die Icons.
- Der Slider „Leben justieren“ sendet `updateLife(roundId, playerId, livesRemaining)` und zeigt Optimistic UI. Schlägt das Update fehl, wird der alte Wert wiederhergestellt.
- Fällt ein Spieler auf das letzte Leben, blendet der Client das Schwimmst-Banner ein. Sobald die Leben auf 0 sinken, wird automatisch der Lose-Screen geöffnet und im Resume-Status vermerkt.

## Scoring & Leaderboard
- Scores werden pro Spieler serverseitig aggregiert (`scores.pointsTotal`). Die Game-Ansicht zeigt sie live in der PlayerList.
- Der Win-Screen lädt erneut `getCurrentRound` und `listPlayers`, um Siegername, Rundennummer und aktuelle Score-Tabelle anzuzeigen. Von dort startet `startNextRound` die nächste Runde.
- Die Rangliste konsumiert eigene Endpunkte (`leaderboards` bzw. Legacy `/leaderboard`). Optional kann eine SSE/Streaming-Quelle genutzt werden; andernfalls pollt der Client alle 4 s und merged Änderungen lokal.
- Lobbys lassen sich direkt aus der Rangliste löschen (mit hartem oder weichem Delete). Das Rejoin-CTA auf jeder Kachel generiert einen Link mit Lobbyname/-ID, sodass Spieler:innen ohne Tipparbeit zurück in ihre Runde finden.
- Resume: Beim Wechsel auf Lose/Game speichert der Client, welcher View zuletzt aktiv war und welche Rundennummer relevant ist. Der Resume-CTA baut daraus einen Deep-Link und prüft vorab, ob der Spieler laut Backend noch existiert.
