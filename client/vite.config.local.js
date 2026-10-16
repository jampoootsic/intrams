import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Local dev config for this machine: the normal API port (3001) is currently
// used by another project (teachaid's Vite server), so:
//   - Frontend stays on the usual URL  http://localhost:5174
//   - Proxies /api and /uploads to THIS project's API on port 3010
// Start the API with:  (in server/)  $env:PORT=3010; node index.js
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3010',
      '/uploads': 'http://localhost:3010',
    },
  },
});