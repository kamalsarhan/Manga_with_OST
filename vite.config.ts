import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    base: './', // Use relative paths for built assets
    build: {
        outDir: 'dist/renderer',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
            }
        }
    }
});
