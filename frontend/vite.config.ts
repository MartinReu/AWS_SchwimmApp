import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Optional: Proxy aktivieren und später /api im Frontend nutzen
  // server: {
  //   proxy: {
  //     '/api': { target: 'http://localhost:4000', changeOrigin: true }
  //   }
  // }
})
