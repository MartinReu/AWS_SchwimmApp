import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        host: true, // erlaubt Zugriff im Heimnetz (0.0.0.0), z. B. fuer Smartphone-Tests
        port: 5173,
    },
    preview: {
        host: true, // gleiches Verhalten fuer den Preview-Server im LAN
        port: 4173,
    },
    // Optional: Proxy aktivieren und spaeter /api im Frontend nutzen
    // server: {
    //   proxy: {
    //     '/api': { target: 'http://localhost:4000', changeOrigin: true }
    //   }
    // }
});
