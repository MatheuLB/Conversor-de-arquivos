// Catálogo de formatos: o que o Converta reconhece e para onde cada um pode ir.

export const KINDS = {
  image: { label: 'Imagem' },
  pdf: { label: 'PDF' },
  video: { label: 'Vídeo' },
  audio: { label: 'Áudio' },
  doc: { label: 'Documento' },
  data: { label: 'Dados e planilhas' },
};

export const FORMATS = {
  // Imagens
  png: { kind: 'image', name: 'PNG', mime: 'image/png' },
  jpg: { kind: 'image', name: 'JPG', mime: 'image/jpeg' },
  webp: { kind: 'image', name: 'WEBP', mime: 'image/webp' },
  gif: { kind: 'image', name: 'GIF', mime: 'image/gif' },
  bmp: { kind: 'image', name: 'BMP', mime: 'image/bmp' },
  ico: { kind: 'image', name: 'ICO', mime: 'image/x-icon' },
  tiff: { kind: 'image', name: 'TIFF', mime: 'image/tiff' },
  avif: { kind: 'image', name: 'AVIF', mime: 'image/avif' },
  heic: { kind: 'image', name: 'HEIC', mime: 'image/heic', inputOnly: true },
  svg: { kind: 'image', name: 'SVG', mime: 'image/svg+xml', inputOnly: true },

  pdf: { kind: 'pdf', name: 'PDF', mime: 'application/pdf' },

  // Vídeo
  mp4: { kind: 'video', name: 'MP4', mime: 'video/mp4' },
  webm: { kind: 'video', name: 'WEBM', mime: 'video/webm' },
  mov: { kind: 'video', name: 'MOV', mime: 'video/quicktime' },
  mkv: { kind: 'video', name: 'MKV', mime: 'video/x-matroska' },
  avi: { kind: 'video', name: 'AVI', mime: 'video/x-msvideo' },
  m4v: { kind: 'video', name: 'M4V', mime: 'video/x-m4v', inputOnly: true },
  wmv: { kind: 'video', name: 'WMV', mime: 'video/x-ms-wmv', inputOnly: true },
  flv: { kind: 'video', name: 'FLV', mime: 'video/x-flv', inputOnly: true },
  '3gp': { kind: 'video', name: '3GP', mime: 'video/3gpp', inputOnly: true },
  mpeg: { kind: 'video', name: 'MPEG', mime: 'video/mpeg', inputOnly: true },

  // Áudio
  mp3: { kind: 'audio', name: 'MP3', mime: 'audio/mpeg' },
  wav: { kind: 'audio', name: 'WAV', mime: 'audio/wav' },
  ogg: { kind: 'audio', name: 'OGG', mime: 'audio/ogg' },
  m4a: { kind: 'audio', name: 'M4A', mime: 'audio/mp4' },
  aac: { kind: 'audio', name: 'AAC', mime: 'audio/aac' },
  flac: { kind: 'audio', name: 'FLAC', mime: 'audio/flac' },
  opus: { kind: 'audio', name: 'OPUS', mime: 'audio/opus' },
  wma: { kind: 'audio', name: 'WMA', mime: 'audio/x-ms-wma', inputOnly: true },
  amr: { kind: 'audio', name: 'AMR', mime: 'audio/amr', inputOnly: true },

  // Documentos
  docx: { kind: 'doc', name: 'DOCX', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', inputOnly: true },
  md: { kind: 'doc', name: 'MD', mime: 'text/markdown' },
  html: { kind: 'doc', name: 'HTML', mime: 'text/html' },
  txt: { kind: 'doc', name: 'TXT', mime: 'text/plain' },

  // Dados e planilhas
  xlsx: { kind: 'data', name: 'XLSX', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  csv: { kind: 'data', name: 'CSV', mime: 'text/csv' },
  tsv: { kind: 'data', name: 'TSV', mime: 'text/tab-separated-values' },
  json: { kind: 'data', name: 'JSON', mime: 'application/json' },
  yaml: { kind: 'data', name: 'YAML', mime: 'application/yaml' },
  xml: { kind: 'data', name: 'XML', mime: 'application/xml' },
};

const ALIASES = {
  jpeg: 'jpg', jfif: 'jpg', tif: 'tiff', heif: 'heic', htm: 'html', markdown: 'md',
  yml: 'yaml', mpg: 'mpeg', oga: 'ogg', qt: 'mov', text: 'txt',
};

const IMAGE_OUT = ['png', 'jpg', 'webp', 'gif', 'bmp', 'ico', 'tiff', 'avif', 'pdf'];
const VIDEO_OUT = ['mp4', 'webm', 'mov', 'mkv', 'avi', 'gif', 'mp3', 'wav', 'ogg', 'm4a', 'flac'];
const AUDIO_OUT = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus'];

const TARGETS = {
  image: IMAGE_OUT,
  pdf: ['png', 'jpg', 'webp', 'txt'],
  video: VIDEO_OUT,
  audio: AUDIO_OUT,
  docx: ['pdf', 'html', 'md', 'txt'],
  md: ['html', 'pdf', 'txt'],
  html: ['pdf', 'md', 'txt'],
  txt: ['pdf', 'html', 'md'],
  csv: ['xlsx', 'json', 'tsv', 'yaml', 'xml', 'html'],
  tsv: ['xlsx', 'csv', 'json', 'yaml', 'xml', 'html'],
  xlsx: ['csv', 'json', 'tsv', 'yaml', 'xml', 'html'],
  json: ['yaml', 'xml', 'csv', 'tsv', 'xlsx'],
  yaml: ['json', 'xml', 'csv', 'tsv', 'xlsx'],
  xml: ['json', 'yaml'],
};

// Formatos de saída que dependem do navegador saber gerá-los.
const runtimeSupport = { avif: null };

export function canEncodeAvif() {
  if (runtimeSupport.avif === null) {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      runtimeSupport.avif = c.toDataURL('image/avif').startsWith('data:image/avif');
    } catch {
      runtimeSupport.avif = false;
    }
  }
  return runtimeSupport.avif;
}

export function extOf(filename) {
  const m = /\.([a-z0-9]+)$/i.exec(filename || '');
  if (!m) return null;
  const ext = m[1].toLowerCase();
  return ALIASES[ext] || ext;
}

// Arquivos sem extensão (ex.: imagem colada com Ctrl+V) caem aqui.
export function extFromMime(mime) {
  if (!mime) return null;
  for (const [ext, f] of Object.entries(FORMATS)) if (f.mime === mime) return ext;
  if (mime === 'image/jpg') return 'jpg';
  return null;
}

export function detect(file) {
  const ext = extOf(file.name) || extFromMime(file.type);
  return ext && FORMATS[ext] ? ext : null;
}

export function targetsFor(ext) {
  const f = FORMATS[ext];
  if (!f) return [];
  let list = TARGETS[ext] || TARGETS[f.kind] || [];
  // GIF animado pode virar vídeo de verdade.
  if (ext === 'gif') list = [...list, 'mp4', 'webm'];
  return list.filter((t) => t !== ext && !(t === 'avif' && !canEncodeAvif()));
}

export function kindOf(ext) {
  return FORMATS[ext]?.kind;
}

export function mimeOf(ext) {
  return FORMATS[ext]?.mime || 'application/octet-stream';
}

export function labelOf(ext) {
  return FORMATS[ext]?.name || ext.toUpperCase();
}

export function acceptedExtensions() {
  return [...Object.keys(FORMATS), ...Object.keys(ALIASES)];
}

// Para a tabela de referência na página.
export function catalogByKind() {
  const order = Object.keys(FORMATS);
  const out = {};
  for (const [ext, f] of Object.entries(FORMATS)) {
    (out[f.kind] ||= { inputs: [], outputs: new Set() }).inputs.push(ext);
    for (const t of targetsFor(ext)) out[f.kind].outputs.add(t);
  }
  for (const entry of Object.values(out)) {
    entry.outputs = [...entry.outputs].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }
  return out;
}
