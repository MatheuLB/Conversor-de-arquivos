// Copia arquivos de apoio do pdf.js (fontes, mapas de caracteres, decodificadores)
// para public/pdfjs, de onde o Vite os serve no site e no app.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'pdfjs-dist');
const dest = join(root, 'public', 'pdfjs');

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  cpSync(join(src, dir), join(dest, dir), { recursive: true });
}
console.log('pdf.js: arquivos de apoio copiados para public/pdfjs');
