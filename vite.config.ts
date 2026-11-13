import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build -- --mode single` inlines everything into one HTML file
// (handy for emailing a preview). The default build is a normal static site.
export default defineConfig(({ mode }) => ({
  base: './', // relative paths so the build works on GitHub Pages, Netlify, Vercel or any sub-path
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  build: { chunkSizeWarningLimit: 1600, outDir: mode === 'single' ? 'dist-single' : 'dist' },
}));
