import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { notesContent } from './plugins/notes-content';

export default defineConfig({
  base: './',
  plugins: [react(), notesContent({ dir: 'content' })],
  build: {
    chunkSizeWarningLimit: 3200,
  },
  server: {
    port: 5173,
    // `npm run dev -- --open` (or `start.bat`) launches a browser when you want one.
    open: false,
  },
});
