import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`        → normal multi-asset build (deploy to Vercel/Netlify)
// `SINGLE=1 npm run build` → one self-contained index.html (demo / artifact)
const single = process.env.SINGLE === '1';

export default defineConfig({
  base: './',
  plugins: [react(), ...(single ? [viteSingleFile()] : [])],
  build: {
    outDir: single ? 'dist-single' : 'dist',
    cssCodeSplit: !single,
    assetsInlineLimit: single ? 100_000_000 : 4096,
    chunkSizeWarningLimit: 3000,
    rollupOptions: single ? { output: { inlineDynamicImports: true } } : undefined,
  },
});
