import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Builds the games React bundle into static/games/ which Hugo serves at /games/
// One bundle, all games — Hugo pages mount the right component via data-game attr.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'static/games',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/mount.tsx'),
      output: {
        entryFileNames: 'datadrip-games.js',
        chunkFileNames: 'datadrip-games-[name].js',
        assetFileNames: 'datadrip-games-[name][extname]',
        format: 'iife',
        inlineDynamicImports: true,
      },
    },
  },
});
