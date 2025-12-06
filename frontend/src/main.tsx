/**
 * Einstiegspunkt für das React-Frontend.
 * Bindet das Root-`App`-Routing in das DOM-Element #root ein und lädt die globale CSS-Pipeline.
 * Wird von Vite gebündelt und vom Browser unmittelbar nach dem Laden von index.html ausgeführt.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { PlayerSessionProvider } from "./context/PlayerSessionContext";
import { seedInitialLoginRequirement } from "./utils/session";

/**
 * Erstellt eine React-Root-Instanz (Concurrency-Ready) und rendert App in StrictMode,
 * damit doppelte Render-Checks in DEV frühzeitig potenzielle Side-Effects aufdecken.
 */
seedInitialLoginRequirement();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PlayerSessionProvider>
      <App />
    </PlayerSessionProvider>
  </React.StrictMode>
);
