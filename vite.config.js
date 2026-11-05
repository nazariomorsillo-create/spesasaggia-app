import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));
export default defineConfig({ root: 'web', plugins: [react()], define: { __VERSIONE__: JSON.stringify(version) }, build: { outDir: '../dist', emptyOutDir: true }, server: { proxy: { '/api': 'http://127.0.0.1:3200' } } });
