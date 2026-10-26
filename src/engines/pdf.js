import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { encodeCanvas } from './image.js';
import { UserError, baseName, outName, pad, packResults } from '../util.js';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// Copiados para /pdfjs por scripts/copy-assets.mjs.
const assetBase = new URL('pdfjs/', document.baseURI).href;

async function openPdf(file) {
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: `${assetBase}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assetBase}standard_fonts/`,
    wasmUrl: `${assetBase}wasm/`,
    iccUrl: `${assetBase}iccs/`,
  });
  try {
    return { task, doc: await task.promise };
  } catch (err) {
    task.destroy();
    if (err?.name === 'PasswordException') throw new UserError('Este PDF tem senha. Remova a senha e tente de novo.');
    throw new UserError('Não foi possível abrir este PDF. O arquivo pode estar corrompido.');
  }
}

async function toImages(doc, file, outExt, settings, onProgress) {
  const scale = (settings.pdfDpi || 150) / 72;
  const results = [];
  const digits = String(doc.numPages).length;
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    // PDFs não têm fundo: pinta de branco para não sair transparente.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, canvas, viewport }).promise;
    const blob = await encodeCanvas(canvas, outExt, settings);
    const name =
      doc.numPages === 1 ? outName(file.name, outExt) : `${baseName(file.name)}-pagina-${pad(n, digits)}.${outExt}`;
    results.push({ name, blob });
    page.cleanup();
    onProgress?.(n / doc.numPages);
  }
  return results;
}

async function toText(doc, file, onProgress) {
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    let text = '';
    for (const item of content.items) {
      if (!('str' in item)) continue;
      text += item.str + (item.hasEOL ? '\n' : '');
    }
    pages.push(text.trim());
    onProgress?.(n / doc.numPages);
  }
  const all = pages.join('\n\n');
  if (!all.trim()) {
    throw new UserError('Este PDF não tem texto selecionável (provavelmente é uma digitalização).');
  }
  return [{ name: outName(file.name, 'txt'), blob: new Blob([all], { type: 'text/plain;charset=utf-8' }) }];
}

export async function convert(file, inExt, outExt, settings, onProgress) {
  const { task, doc } = await openPdf(file);
  try {
    const results =
      outExt === 'txt' ? await toText(doc, file, onProgress) : await toImages(doc, file, outExt, settings, onProgress);
    return [await packResults(results, file.name)];
  } finally {
    task.destroy();
  }
}

// Junta PDFs e imagens (já convertidas em PDF) num só arquivo.
export async function mergePdfs(blobs) {
  const { PDFDocument } = await import('pdf-lib');
  const out = await PDFDocument.create();
  for (const blob of blobs) {
    let src;
    try {
      src = await PDFDocument.load(await blob.arrayBuffer(), { ignoreEncryption: true });
    } catch {
      throw new UserError('Um dos PDFs não pôde ser aberto para juntar.');
    }
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return new Blob([await out.save()], { type: 'application/pdf' });
}
