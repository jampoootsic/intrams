import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Second, non-conflicting dev instance.
// - Serves the frontend on port 5175 (5173/5174 are already in use).
// - Proxies /api and /uploads to the second backend on port 3010
//   (3001 is already running an older build of the API).
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5175,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3010',
      '/uploads': 'http://localhost:3010',
    },
  },
});