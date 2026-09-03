import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In development the browser talks to Vite, which forwards /api
    // to the backend. Same-origin in production, so no CORS anywhere.
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
});
