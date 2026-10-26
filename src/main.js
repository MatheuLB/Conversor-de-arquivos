import './styles.css';
import { KINDS, acceptedExtensions, catalogByKind, detect, kindOf, labelOf, targetsFor } from './formats.js';
import { cancelMedia, convertFile, mergeIntoPdf, usesMedia } from './convert.js';
import { UserError, downloadBlob, formatBytes, zipBlobs } from './util.js';
import { setupDownloads } from './downloads.js';

const isDesktop = Boolean(window.desktop?.isDesktop);
if (isDesktop) document.documentElement.classList.add('is-desktop');

const $ = (sel) => document.querySelector(sel);
const els = {
  drop: $('#drop'),
  input: $('#file-input'),
  area: $('#queue-area'),
  queue: $('#queue'),
  bulk: $('#convert-all-to'),
  convert: $('#btn-convert'),
  zip: $('#btn-zip'),
  merge: $('#btn-merge'),
  clear: $('#btn-clear'),
};

// Formato sugerido ao abrir cada tipo de arquivo.
const DEFAULT_TARGET = {
  heic: 'jpg', png: 'jpg', jpg: 'png', webp: 'png', gif: 'png', svg: 'png', avif: 'jpg', tiff: 'jpg',
  bmp: 'png', ico: 'png', pdf: 'png', mp4: 'mp3', mp3: 'wav', docx: 'pdf', md: 'html', html: 'pdf',
  txt: 'pdf', csv: 'xlsx', tsv: 'csv', xlsx: 'csv', json: 'csv', yaml: 'json', xml: 'json',
};
const DEFAULT_BY_KIND = { video: 'mp4', audio: 'mp3' };

function defaultTarget(ext) {
  const options = targetsFor(ext);
  const wanted = DEFAULT_TARGET[ext] || DEFAULT_BY_KIND[kindOf(ext)];
  return options.includes(wanted) ? wanted : options[0];
}

// ---------- Ajustes ----------

const SETTINGS_KEY = 'converta:ajustes';
const controls = {
  quality: $('#opt-quality'),
  maxWidth: $('#opt-maxwidth'),
  pdfPage: $('#opt-pdfpage'),
  pdfDpi: $('#opt-dpi'),
  videoQuality: $('#opt-video'),
  audioBitrate: $('#opt-bitrate'),
  csvDelimiter: $('#opt-csv'),
};

function readSettings() {
  return {
    quality: Number(controls.quality.value) / 100,
    maxWidth: Number(controls.maxWidth.value),
    pdfPage: controls.pdfPage.value,
    pdfDpi: Number(controls.pdfDpi.value),
    videoQuality: controls.videoQuality.value,
    audioBitrate: Number(controls.audioBitrate.value),
    csvDelimiter: controls.csvDelimiter.value,
  };
}

function restoreSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    for (const [k, el] of Object.entries(controls)) if (saved[k] !== undefined) el.value = saved[k];
  } catch {
    /* sem armazenamento: fica com o padrão */
  }
  $('#opt-quality-out').value = `${controls.quality.value}%`;
}

function saveSettings() {
  $('#opt-quality-out').value = `${controls.quality.value}%`;
  try {
    const raw = Object.fromEntries(Object.entries(controls).map(([k, el]) => [k, el.value]));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(raw));
  } catch {
    /* ignora */
  }
}

for (const el of Object.values(controls)) el.addEventListener('input', saveSettings);
restoreSettings();

// ---------- Aviso ----------

let toastTimer;
function toast(message) {
  let el = $('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 4500);
}

// ---------- Fila ----------

let items = [];
let nextId = 1;
let running = false;
let current = null;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
  }
  node.append(...children.filter((c) => c != null));
  return node;
}

function addFiles(fileList) {
  const files = [...fileList].filter((f) => f.size > 0 || f.name);
  if (!files.length) return;
  for (const file of files) {
    const ext = detect(file);
    const targets = ext ? targetsFor(ext) : [];
    const item = {
      id: nextId++,
      file,
      ext,
      supported: targets.length > 0,
      target: targets.length ? defaultTarget(ext) : null,
      status: 'idle',
      progress: 0,
      message: '',
      results: [],
    };
    item.el = renderItem(item);
    els.queue.append(item.el);
    items.push(item);
  }
  refresh();
}

function renderItem(item) {
  const kind = item.ext ? kindOf(item.ext) : null;
  const name = item.file.name || 'arquivo';
  const chip = el('span', { class: `chip ${kind ? `chip--${kind}` : ''} item__in` }, item.ext ? `.${item.ext}` : '?');
  const meta = el('p', { class: 'item__meta' }, formatBytes(item.file.size));
  const file = el('div', { class: 'item__file' }, el('p', { class: 'item__name', title: name }, name), meta);

  let to;
  if (item.supported) {
    const select = el('select', { class: 'select', 'aria-label': `Converter ${name} para`, id: `alvo-${item.id}` });
    for (const t of targetsFor(item.ext)) select.append(el('option', { value: t, selected: t === item.target }, labelOf(t)));
    select.addEventListener('change', () => {
      item.target = select.value;
      els.bulk.value = '';
      if (item.status !== 'working') resetItem(item);
      refresh();
    });
    to = el('div', { class: 'item__to' }, el('span', { class: 'arrow', 'aria-hidden': 'true' }, '→'), select);
  } else {
    to = el('div', { class: 'item__to' }, 'Formato não suportado');
  }

  const remove = el('button', {
    class: 'item__remove',
    type: 'button',
    'aria-label': `Remover ${name}`,
    title: 'Remover',
    onclick: () => removeItem(item),
  }, '×');

  const li = el('li', { class: `item${item.supported ? '' : ' item--unsupported'}` }, chip, file, to,
    el('div', { class: 'item__status' }), remove);
  return li;
}

function resetItem(item) {
  item.status = 'idle';
  item.results = [];
  item.message = '';
  item.progress = 0;
  renderStatus(item);
}

function removeItem(item) {
  if (item === current) {
    if (usesMedia(item.ext, item.target)) cancelMedia();
    else return toast('Espere esta conversão terminar para remover o arquivo.');
  }
  item.el.remove();
  items = items.filter((i) => i !== item);
  refresh();
}

function renderStatus(item) {
  const box = item.el.querySelector('.item__status');
  box.replaceChildren();
  switch (item.status) {
    case 'queued':
      box.append(el('span', { class: 'status-text' }, 'Na fila'));
      break;
    case 'working': {
      const known = item.progress > 0;
      const bar = el('div', { class: `progress${known ? '' : ' progress--indeterminate'}`, role: 'progressbar',
        'aria-label': `Convertendo ${item.file.name}`, 'aria-valuemin': 0, 'aria-valuemax': 100,
        'aria-valuenow': known ? Math.round(item.progress * 100) : false },
      el('div', { class: 'progress__bar', style: known ? `width:${(item.progress * 100).toFixed(1)}%` : false }));
      box.append(bar);
      if (item.message && !known) box.append(el('span', { class: 'status-text' }, item.message));
      else if (known) box.append(el('span', { class: 'progress-label' }, `${Math.round(item.progress * 100)}%`));
      if (usesMedia(item.ext, item.target)) {
        box.append(el('button', { class: 'btn btn--ghost btn--small', type: 'button', onclick: () => cancelMedia() }, 'Cancelar'));
      }
      break;
    }
    case 'done': {
      const size = item.results.reduce((n, r) => n + r.blob.size, 0);
      box.append(el('span', { class: 'status-text status-text--ok' }, formatBytes(size)));
      box.append(el('button', {
        class: 'btn btn--marker btn--small',
        type: 'button',
        onclick: () => item.results.forEach((r) => downloadBlob(r.blob, r.name)),
      }, 'Baixar'));
      break;
    }
    case 'printed':
      box.append(el('span', { class: 'status-text' }, 'Na janela de impressão, escolha “Salvar como PDF”.'));
      break;
    case 'error':
      box.append(el('span', { class: 'status-text status-text--err' }, item.message));
      break;
    default:
      break;
  }
}

// Atualiza botões e o seletor "Converter todos para".
function refresh() {
  const has = items.length > 0;
  els.area.hidden = !has;
  els.drop.classList.toggle('is-compact', has);

  const pending = items.filter((i) => i.supported && (i.status === 'idle' || i.status === 'error'));
  els.convert.disabled = running || pending.length === 0;
  els.convert.textContent = running ? 'Convertendo…' : pending.length > 1 ? `Converter ${pending.length} arquivos` : 'Converter';
  els.clear.disabled = running;

  const done = items.filter((i) => i.status === 'done');
  els.zip.hidden = done.reduce((n, i) => n + i.results.length, 0) < 2;

  const pdfable = items.filter((i) => i.supported && (kindOf(i.ext) === 'image' || i.ext === 'pdf'));
  els.merge.hidden = pdfable.length < 2;
  els.merge.disabled = running;

  // Opções em comum para todos os arquivos suportados.
  const prev = els.bulk.value;
  const supported = items.filter((i) => i.supported);
  const all = [];
  for (const i of supported) for (const t of targetsFor(i.ext)) if (!all.includes(t)) all.push(t);
  els.bulk.replaceChildren(el('option', { value: '' }, 'Escolha…'));
  for (const t of all) {
    const count = supported.filter((i) => targetsFor(i.ext).includes(t)).length;
    const label = count < supported.length ? `${labelOf(t)} (${count} de ${supported.length})` : labelOf(t);
    els.bulk.append(el('option', { value: t }, label));
  }
  els.bulk.value = all.includes(prev) ? prev : '';
  els.bulk.disabled = running || supported.length === 0;
}

els.bulk.addEventListener('change', () => {
  const t = els.bulk.value;
  if (!t) return;
  for (const item of items) {
    if (!item.supported || item.status === 'working' || !targetsFor(item.ext).includes(t)) continue;
    item.target = t;
    item.el.querySelector('select').value = t;
    resetItem(item);
  }
  refresh();
});

async function runQueue() {
  const settings = readSettings();
  const todo = items.filter((i) => i.supported && (i.status === 'idle' || i.status === 'error'));
  if (!todo.length) return;
  running = true;
  todo.forEach((i) => {
    i.status = 'queued';
    renderStatus(i);
  });
  refresh();

  for (const item of todo) {
    if (!items.includes(item)) continue;
    current = item;
    item.status = 'working';
    item.progress = 0;
    item.message = '';
    renderStatus(item);
    let lastPaint = 0;
    try {
      const results = await convertFile(item.file, item.ext, item.target, settings, (p, message) => {
        item.progress = p;
        if (message) item.message = message;
        const now = performance.now();
        if (now - lastPaint > 120 || p >= 1) {
          lastPaint = now;
          renderStatus(item);
        }
      });
      item.results = results;
      item.status = results.length ? 'done' : 'printed';
    } catch (err) {
      if (!(err instanceof UserError)) console.error(err);
      item.status = 'error';
      item.message = err instanceof UserError ? err.message : `Algo deu errado: ${err?.message || err}`;
    }
    renderStatus(item);
  }
  current = null;
  running = false;
  refresh();

  const ok = todo.filter((i) => i.status === 'done').length;
  if (ok > 1) toast(`${ok} arquivos convertidos. Use “Baixar tudo” para salvar de uma vez.`);
}

els.convert.addEventListener('click', runQueue);

els.zip.addEventListener('click', async () => {
  const entries = items.filter((i) => i.status === 'done').flatMap((i) => i.results);
  els.zip.disabled = true;
  try {
    downloadBlob(await zipBlobs(entries), 'converta-arquivos.zip');
  } finally {
    els.zip.disabled = false;
  }
});

els.merge.addEventListener('click', async () => {
  const parts = items.filter((i) => i.supported && (kindOf(i.ext) === 'image' || i.ext === 'pdf'));
  running = true;
  refresh();
  els.merge.textContent = 'Juntando…';
  try {
    const blob = await mergeIntoPdf(parts.map((i) => ({ file: i.file, ext: i.ext })), readSettings());
    downloadBlob(blob, 'documento-unido.pdf');
    toast(`${parts.length} arquivos juntados em documento-unido.pdf, na ordem da lista.`);
  } catch (err) {
    if (!(err instanceof UserError)) console.error(err);
    toast(err instanceof UserError ? err.message : 'Não foi possível juntar os arquivos.');
  } finally {
    els.merge.textContent = 'Juntar em um PDF';
    running = false;
    refresh();
  }
});

els.clear.addEventListener('click', () => {
  items = [];
  els.queue.replaceChildren();
  els.bulk.value = '';
  refresh();
});

window.addEventListener('beforeunload', (e) => {
  if (running) e.preventDefault();
});

// ---------- Entrada de arquivos ----------

els.input.accept = acceptedExtensions().map((e) => `.${e}`).join(',');
els.drop.addEventListener('click', () => els.input.click());
els.drop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    els.input.click();
  }
});
els.input.addEventListener('change', () => {
  addFiles(els.input.files);
  els.input.value = '';
});

// Arrastar para qualquer lugar da janela.
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  dragDepth++;
  els.drop.classList.add('is-over');
});
window.addEventListener('dragleave', (e) => {
  if (!hasFiles(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) els.drop.classList.remove('is-over');
});
window.addEventListener('dragover', (e) => {
  if (hasFiles(e)) e.preventDefault();
});
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  els.drop.classList.remove('is-over');
  addFiles(e.dataTransfer.files);
});

document.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (!files.length) return;
  // Imagens coladas vêm sem nome: dá um nome com data e hora.
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  addFiles(files.map((f, i) => (f.name && f.name !== 'image.png' ? f : new File([f], `colado-${stamp}${i ? `-${i + 1}` : ''}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: f.type }))));
});

// ---------- Tabela de formatos ----------

function renderFormatTable() {
  const catalog = catalogByKind();
  const table = $('#format-table');
  for (const [kind, { label }] of Object.entries(KINDS)) {
    const entry = catalog[kind];
    if (!entry) continue;
    const chips = (exts) => el('div', { class: 'format-row__chips' },
      ...exts.map((e) => el('span', { class: `chip chip--${kindOf(e)}` }, e)));
    table.append(el('div', { class: 'format-row' },
      el('div', { class: 'format-row__kind' }, label),
      el('div', {}, el('span', { class: 'format-row__label' }, 'De'), chips(entry.inputs)),
      el('div', { class: 'format-row__arrow', 'aria-hidden': 'true' }, '→'),
      el('div', {}, el('span', { class: 'format-row__label' }, 'Para'), chips(entry.outputs))));
  }
}

renderFormatTable();
if (!isDesktop) setupDownloads();
refresh();
