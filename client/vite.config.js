import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on all network interfaces so the app can be opened from
    // other devices on the same LAN (phone, tablet, other PC).
    host: true,
    port: 5174,
    // Fail fast instead of silently switching to another port (keeps the
    // proxy + backend CORS in sync with the actual URL).
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3010',
      // Let photos show on network devices in dev mode too.
      '/uploads': 'http://localhost:3010',
    },
  },
});