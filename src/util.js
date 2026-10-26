import { mimeOf } from './formats.js';

// Erro com mensagem pronta para mostrar ao usuário.
export class UserError extends Error {}

export function baseName(filename) {
  return filename.replace(/\.[^.]+$/, '') || 'arquivo';
}

export function outName(filename, ext) {
  return `${baseName(filename)}.${ext}`;
}

export function blobOf(data, ext) {
  return data instanceof Blob ? data : new Blob([data], { type: mimeOf(ext) });
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let i = -1;
  do {
    n /= 1024;
    i++;
  } while (n >= 1024 && i < units.length - 1);
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: n < 10 ? 1 : 0 })} ${units[i]}`;
}

// entries: [{ name, blob }] -> Blob .zip
export async function zipBlobs(entries) {
  const { zip } = await import('fflate');
  const files = {};
  const used = new Set();
  for (const { name, blob } of entries) {
    let n = name;
    for (let i = 2; used.has(n); i++) n = name.replace(/(\.[^.]+)?$/, ` (${i})$1`);
    used.add(n);
    files[n] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
  }
  const data = await new Promise((resolve, reject) =>
    zip(files, (err, out) => (err ? reject(err) : resolve(out))),
  );
  return new Blob([data], { type: 'application/zip' });
}

// Vários resultados viram um .zip; um só é devolvido direto.
export async function packResults(results, filename) {
  if (results.length === 1) return results[0];
  return { name: `${baseName(filename)}.zip`, blob: await zipBlobs(results) };
}

export function readText(file) {
  return file.text();
}

export function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new UserError('O navegador não conseguiu gerar a imagem.'))),
      mime,
      quality,
    ),
  );
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function pad(n, width) {
  return String(n).padStart(width, '0');
}
