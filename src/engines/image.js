import { labelOf, mimeOf } from '../formats.js';
import { UserError, canvasToBlob, outName } from '../util.js';

// ---------- Leitura ----------

async function decodeHeic(file) {
  const heic2any = (await import('heic2any')).default;
  const out = await heic2any({ blob: file, toType: 'image/png' });
  return createImageBitmap(Array.isArray(out) ? out[0] : out);
}

async function decodeTiff(file) {
  const UTIF = (await import('utif2')).default;
  const buf = await file.arrayBuffer();
  const ifds = UTIF.decode(buf);
  const page = ifds.find((i) => i.width && i.height) || ifds[0];
  UTIF.decodeImage(buf, page, ifds);
  const rgba = UTIF.toRGBA8(page);
  const canvas = document.createElement('canvas');
  canvas.width = page.width;
  canvas.height = page.height;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer), page.width, page.height), 0, 0);
  return canvas;
}

function loadImgElement(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new UserError('Não foi possível abrir esta imagem. O arquivo pode estar corrompido.'));
    };
    img.src = url;
  });
}

// SVG não tem tamanho em pixels: definimos um antes de rasterizar.
async function decodeSvg(file, maxWidth) {
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  if (svg.nodeName !== 'svg') throw new UserError('Este SVG não é válido.');
  const num = (v) => (v && !v.endsWith('%') ? parseFloat(v) : NaN);
  let w = num(svg.getAttribute('width'));
  let h = num(svg.getAttribute('height'));
  const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
    if (!w && !h) [w, h] = [vb[2], vb[3]];
    else if (!h) h = (w * vb[3]) / vb[2];
    else if (!w) w = (h * vb[2]) / vb[3];
  }
  if (!w || !h) [w, h] = [1024, 1024];
  // Ícones pequenos ficam nítidos: renderiza com pelo menos 1024 px de largura.
  const target = maxWidth || Math.min(Math.max(w, 1024), 4096);
  const scale = target / w;
  svg.setAttribute('width', Math.round(w * scale));
  svg.setAttribute('height', Math.round(h * scale));
  const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
  return loadImgElement(blob);
}

export async function decodeImage(file, ext, settings = {}) {
  if (ext === 'heic') return decodeHeic(file);
  if (ext === 'tiff') return decodeTiff(file);
  if (ext === 'svg') return decodeSvg(file, settings.maxWidth);
  try {
    return await createImageBitmap(file);
  } catch {
    return loadImgElement(file);
  }
}

function sizeOf(src) {
  return [src.naturalWidth || src.width, src.naturalHeight || src.height];
}

export function drawToCanvas(src, { maxWidth = 0, background = null } = {}) {
  let [w, h] = sizeOf(src);
  if (maxWidth && w > maxWidth) {
    h = Math.max(1, Math.round((h * maxWidth) / w));
    w = maxWidth;
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return canvas;
}

export function hasTransparency(canvas) {
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

// ---------- Escrita ----------

function encodeBmp(canvas) {
  const { width: w, height: h } = canvas;
  const { data } = canvas.getContext('2d').getImageData(0, 0, w, h);
  const rowSize = Math.ceil((w * 3) / 4) * 4;
  const size = 54 + rowSize * h;
  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  out[0] = 0x42;
  out[1] = 0x4d;
  v.setUint32(2, size, true);
  v.setUint32(10, 54, true);
  v.setUint32(14, 40, true);
  v.setInt32(18, w, true);
  v.setInt32(22, h, true);
  v.setUint16(26, 1, true);
  v.setUint16(28, 24, true);
  v.setUint32(34, rowSize * h, true);
  v.setInt32(38, 2835, true);
  v.setInt32(42, 2835, true);
  for (let y = 0; y < h; y++) {
    let src = (h - 1 - y) * w * 4;
    let dst = 54 + y * rowSize;
    for (let x = 0; x < w; x++, src += 4) {
      out[dst++] = data[src + 2];
      out[dst++] = data[src + 1];
      out[dst++] = data[src];
    }
  }
  return out;
}

async function encodeGif(canvas) {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
  const { width: w, height: h } = canvas;
  const { data } = canvas.getContext('2d').getImageData(0, 0, w, h);
  const alpha = hasTransparency(canvas);
  const format = alpha ? 'rgba4444' : 'rgb565';
  const palette = quantize(data, 256, { format, oneBitAlpha: alpha });
  const index = applyPalette(data, palette, format);
  const transparentIndex = alpha ? palette.findIndex((c) => c[3] === 0) : -1;
  const gif = GIFEncoder();
  gif.writeFrame(index, w, h, {
    palette,
    transparent: transparentIndex >= 0,
    transparentIndex: Math.max(0, transparentIndex),
  });
  gif.finish();
  return gif.bytes();
}

async function encodeTiff(canvas) {
  const UTIF = (await import('utif2')).default;
  const { width: w, height: h } = canvas;
  const { data } = canvas.getContext('2d').getImageData(0, 0, w, h);
  return UTIF.encodeImage(data.buffer, w, h);
}

// ICO com várias resoluções (16 a 256 px), cada uma em PNG.
async function encodeIco(canvas) {
  const sizes = [16, 32, 48, 256];
  const images = [];
  for (const s of sizes) {
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    const k = s / Math.max(canvas.width, canvas.height);
    const w = canvas.width * k;
    const h = canvas.height * k;
    ctx.drawImage(canvas, (s - w) / 2, (s - h) / 2, w, h);
    images.push(new Uint8Array(await (await canvasToBlob(c, 'image/png')).arrayBuffer()));
  }
  const headerSize = 6 + 16 * sizes.length;
  const total = headerSize + images.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  v.setUint16(2, 1, true);
  v.setUint16(4, sizes.length, true);
  let offset = headerSize;
  sizes.forEach((s, i) => {
    const e = 6 + i * 16;
    out[e] = s >= 256 ? 0 : s;
    out[e + 1] = s >= 256 ? 0 : s;
    v.setUint16(e + 4, 1, true);
    v.setUint16(e + 6, 32, true);
    v.setUint32(e + 8, images[i].length, true);
    v.setUint32(e + 12, offset, true);
    out.set(images[i], offset);
    offset += images[i].length;
  });
  return out;
}

// Uma página por imagem. "a4" centraliza a imagem numa folha A4 com margem.
export async function canvasesToPdf(canvases, settings = {}) {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const quality = settings.quality ?? 0.9;
  for (const canvas of canvases) {
    const usePng = hasTransparency(canvas);
    const blob = await canvasToBlob(canvas, usePng ? 'image/png' : 'image/jpeg', usePng ? undefined : quality);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const img = usePng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    if (settings.pdfPage === 'a4') {
      const landscape = img.width > img.height;
      const [pw, ph] = landscape ? [841.89, 595.28] : [595.28, 841.89];
      const margin = 28;
      const k = Math.min((pw - margin * 2) / img.width, (ph - margin * 2) / img.height, 1);
      const w = img.width * k;
      const h = img.height * k;
      pdf.addPage([pw, ph]).drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    } else {
      // 96 px por polegada -> 72 pontos por polegada.
      const w = img.width * 0.75;
      const h = img.height * 0.75;
      pdf.addPage([w, h]).drawImage(img, { x: 0, y: 0, width: w, height: h });
    }
  }
  return new Blob([await pdf.save()], { type: 'application/pdf' });
}

export async function encodeCanvas(canvas, ext, settings = {}) {
  const quality = settings.quality ?? 0.9;
  switch (ext) {
    case 'png':
    case 'jpg':
    case 'webp':
    case 'avif': {
      const mime = mimeOf(ext);
      const blob = await canvasToBlob(canvas, mime, ext === 'png' ? undefined : quality);
      if (blob.type !== mime) {
        throw new UserError(`Este navegador não consegue gerar ${labelOf(ext)}. Use o Chrome, o Edge ou o app do Converta.`);
      }
      return blob;
    }
    case 'bmp':
      return new Blob([encodeBmp(canvas)], { type: mimeOf('bmp') });
    case 'gif':
      return new Blob([await encodeGif(canvas)], { type: mimeOf('gif') });
    case 'tiff':
      return new Blob([await encodeTiff(canvas)], { type: mimeOf('tiff') });
    case 'ico':
      return new Blob([await encodeIco(canvas)], { type: mimeOf('ico') });
    case 'pdf':
      return canvasesToPdf([canvas], settings);
    default:
      throw new UserError(`Conversão de imagem para ${labelOf(ext)} não suportada.`);
  }
}

// Formatos sem transparência recebem fundo branco.
const OPAQUE = new Set(['jpg', 'bmp']);

export async function fileToCanvas(file, ext, settings = {}, background = null) {
  const src = await decodeImage(file, ext, settings);
  const canvas = drawToCanvas(src, { maxWidth: settings.maxWidth, background });
  src.close?.();
  return canvas;
}

export async function convert(file, inExt, outExt, settings) {
  const canvas = await fileToCanvas(file, inExt, settings, OPAQUE.has(outExt) ? '#ffffff' : null);
  const blob = await encodeCanvas(canvas, outExt, settings);
  return [{ name: outName(file.name, outExt), blob }];
}
