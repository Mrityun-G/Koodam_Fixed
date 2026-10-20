import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server:
  {
    port: 5173,
    host: true
  },
  build: {
    rollupOptions: {
      output: {
        // Keep the big libraries in their own files. They change far less
        // often than our screens, so a returning visitor re-downloads only
        // what we actually changed. Leaflet lands here too, but nothing in
        // the first paint imports it, so it only arrives with a map screen.
        manualChunks: {
          react: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
          firebase: [
            'firebase/app',
            'firebase/auth',
            'firebase/database',
            'firebase/storage'
          ],
          map: ['leaflet', 'react-leaflet'],
          supabase: ['@supabase/supabase-js']
        }
      }
    }
  }
});
