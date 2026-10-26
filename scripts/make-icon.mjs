// Gera build/icon.png (1024 px) a partir de public/icon.svg. O electron-builder
// transforma esse PNG em .ico (Windows) e .icns (Mac).
// Uso: node scripts/make-icon.mjs   (precisa do Playwright instalado)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public', 'icon.svg'), 'utf8');
const size = 1024;
// Margem transparente de ~9%, como os ícones do macOS.
const pad = Math.round(size * 0.09);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: size, height: size } });
await page.setContent(
  `<style>html,body{margin:0;background:transparent}svg{display:block;margin:${pad}px;width:${size - pad * 2}px;height:${size - pad * 2}px}</style>${svg}`,
);
await page.screenshot({ path: join(root, 'build', 'icon.png'), omitBackground: true });
await browser.close();
console.log('build/icon.png gerado');
