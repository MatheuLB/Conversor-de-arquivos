// Monta a versão portátil do Windows: um .zip com a pasta "Converta" dentro.
// Quem baixa só precisa extrair e abrir Converta.exe (sem instalar nada).
// Roda depois do electron-builder, que deixa o app pronto em release/win-unpacked.
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const unpacked = join(root, 'release', 'win-unpacked');
const zipPath = join(root, 'release', 'Converta-windows.zip');
if (!existsSync(unpacked)) {
  console.error('release/win-unpacked não existe. Rode antes: npx electron-builder --win');
  process.exit(1);
}

const README = [
  'Converta — versão portátil para Windows',
  '',
  'Para abrir: clique duas vezes em Converta.exe.',
  'Não precisa instalar. Pode guardar esta pasta onde quiser, até num pendrive.',
  '',
  'Se aparecer "O Windows protegeu o computador", clique em "Mais informações"',
  'e depois em "Executar assim mesmo". Isso acontece porque o app não tem assinatura paga.',
  '',
  'Para remover, é só apagar esta pasta.',
  '',
].join('\r\n');

const files = { 'Converta/LEIA-ME.txt': new TextEncoder().encode(README) };
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else files[`Converta/${relative(unpacked, full).split('\\').join('/')}`] = readFileSync(full);
  }
};
walk(unpacked);

rmSync(zipPath, { force: true });
writeFileSync(zipPath, zipSync(files, { level: 6 }));
console.log(`Versão portátil criada: release/Converta-windows.zip (${Object.keys(files).length} arquivos)`);
