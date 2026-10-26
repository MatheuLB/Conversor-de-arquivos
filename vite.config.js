import { defineConfig } from 'vite';

export default defineConfig({
  // Caminhos relativos: o mesmo build funciona no GitHub Pages (/repositorio/) e dentro do app.
  base: './',
  optimizeDeps: {
    // O FFmpeg cria o próprio Web Worker; o pré-empacotamento do Vite quebra isso.
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4096,
  },
});
