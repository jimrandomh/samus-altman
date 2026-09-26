// Dev server for Samus playtests: no HMR, so edits elsewhere in the tree don't reload the page mid-test.
import { defineConfig } from 'vite';
export default defineConfig({ root: new URL('../..', import.meta.url).pathname, server: { hmr: false } });
