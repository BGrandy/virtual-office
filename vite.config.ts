import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/** The commit this build came from, so the app can show which version is live. */
function commit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}

// `npm run build -- --mode single` inlines everything into one HTML file
// (handy for emailing a preview). The default build is a normal static site.
export default defineConfig(({ mode }) => ({
  base: './', // relative paths so the build works on GitHub Pages, Netlify, Vercel or any sub-path
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  define: { __BUILD__: JSON.stringify({ commit: commit(), time: new Date().toISOString() }) },
  build: { chunkSizeWarningLimit: 1600, outDir: mode === 'single' ? 'dist-single' : 'dist' },
}));
