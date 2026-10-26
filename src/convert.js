import { kindOf } from './formats.js';

// Cada motor só é baixado quando um arquivo do tipo dele aparece.
const engines = {
  image: () => import('./engines/image.js'),
  pdf: () => import('./engines/pdf.js'),
  media: () => import('./engines/media.js'),
  doc: () => import('./engines/document.js'),
  data: () => import('./engines/data.js'),
};

function engineFor(inExt, outExt) {
  const kind = kindOf(inExt);
  if (kind === 'video' || kind === 'audio') return 'media';
  if (inExt === 'gif' && (outExt === 'mp4' || outExt === 'webm')) return 'media';
  return kind;
}

// Devolve [{ name, blob }]. Lista vazia = o resultado foi para a janela de impressão.
export async function convertFile(file, inExt, outExt, settings, onProgress) {
  const engine = await engines[engineFor(inExt, outExt)]();
  return engine.convert(file, inExt, outExt, settings, onProgress);
}

export function usesMedia(inExt, outExt) {
  return engineFor(inExt, outExt) === 'media';
}

export async function cancelMedia() {
  (await engines.media()).cancel();
}

// Junta imagens e PDFs, na ordem da lista, num único PDF.
export async function mergeIntoPdf(items, settings) {
  const [{ fileToCanvas, canvasesToPdf }, { mergePdfs }] = await Promise.all([engines.image(), engines.pdf()]);
  const parts = [];
  for (const { file, ext } of items) {
    if (ext === 'pdf') parts.push(file);
    else parts.push(await canvasesToPdf([await fileToCanvas(file, ext, settings)], settings));
  }
  return mergePdfs(parts);
}
