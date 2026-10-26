import { wrapHtml } from './document.js';
import { UserError, baseName, outName, packResults } from '../util.js';

// Dois formatos intermediários:
//   tabela -> { sheets: [{ name, headers, rows: [{ coluna: valor }] }] }   (CSV, TSV, XLSX)
//   árvore -> { tree: qualquer valor JSON }                                (JSON, YAML, XML)

// ---------- Utilidades ----------

const NUMBER = /^-?(0|[1-9]\d{0,14})(\.\d+)?$/;

// "42" -> 42, "true" -> true, "" -> null. "007" e "1.234,56" continuam texto.
function typed(v) {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  if (t === '') return null;
  if (NUMBER.test(t)) return Number(t);
  if (/^(true|false)$/i.test(t)) return t.toLowerCase() === 'true';
  return v;
}

function isoDate(d) {
  const iso = d.toISOString();
  return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
}

// Converte datas em texto e remove valores que JSON/YAML não representam.
function plain(v) {
  if (v instanceof Date) return isoDate(v);
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v === undefined ? null : v;
}

function uniqueHeaders(raw) {
  const seen = new Map();
  return raw.map((h, i) => {
    let name = String(h ?? '').trim() || `coluna_${i + 1}`;
    const n = seen.get(name) || 0;
    seen.set(name, n + 1);
    if (n) name = `${name}_${n + 1}`;
    return name;
  });
}

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) flatten(v, key, out);
    else if (Array.isArray(v)) out[key] = v.every((x) => x === null || typeof x !== 'object') ? v.join(', ') : JSON.stringify(v);
    else out[key] = v;
  }
  return out;
}

function sheetFromArray(name, arr) {
  const rows = arr.map((item) =>
    item && typeof item === 'object' && !Array.isArray(item) ? flatten(item) : { valor: Array.isArray(item) ? JSON.stringify(item) : item },
  );
  const headers = [];
  const seen = new Set();
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) {
        seen.add(k);
        headers.push(k);
      }
    }
  }
  return { name, headers, rows };
}

// Acha a lista de registros dentro de um JSON/YAML/XML.
function treeToSheets(tree) {
  if (Array.isArray(tree)) return [sheetFromArray('Planilha1', tree)];
  if (tree && typeof tree === 'object') {
    const entries = Object.entries(tree);
    const arrays = entries.filter(([, v]) => Array.isArray(v));
    if (arrays.length && arrays.length === entries.length) return arrays.map(([k, v]) => sheetFromArray(k, v));
    if (entries.length === 1 && entries[0][1] && typeof entries[0][1] === 'object') return treeToSheets(entries[0][1]);
    return [sheetFromArray('Planilha1', [tree])];
  }
  return [sheetFromArray('Planilha1', [{ valor: tree }])];
}

function sheetsToTree(sheets, typeValues) {
  const conv = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeValues ? typed(v) : v])));
  if (sheets.length === 1) return conv(sheets[0].rows);
  return Object.fromEntries(sheets.map((s) => [s.name, conv(s.rows)]));
}

// ---------- Leitura ----------

async function readDelimited(file, inExt) {
  const Papa = (await import('papaparse')).default;
  const text = (await file.text()).replace(/^﻿/, '');
  // Sem delimitador fixo no CSV: o Papa detecta vírgula, ponto e vírgula etc.
  const res = Papa.parse(text, { skipEmptyLines: 'greedy', delimiter: inExt === 'tsv' ? '\t' : '' });
  if (!res.data.length) throw new UserError('O arquivo está vazio.');
  const [head, ...body] = res.data;
  const headers = uniqueHeaders(head);
  const rows = body.map((cells) => Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ''])));
  return { sheets: [{ name: 'Planilha1', headers, rows }], fromText: true };
}

async function readXlsx(file) {
  const { default: readXlsxFile } = await import('read-excel-file/browser');
  let sheets;
  try {
    sheets = await readXlsxFile(file);
  } catch {
    throw new UserError('Não foi possível ler esta planilha. Arquivos .xls antigos precisam ser salvos como .xlsx.');
  }
  const out = sheets
    .filter((s) => s.data.length)
    .map((s) => {
      const [head, ...body] = s.data;
      const headers = uniqueHeaders(head);
      const rows = body.map((cells) => Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? null])));
      return { name: s.sheet, headers, rows };
    });
  if (!out.length) throw new UserError('A planilha está vazia.');
  return { sheets: out };
}

async function readTree(file, inExt) {
  const text = (await file.text()).replace(/^﻿/, '');
  try {
    if (inExt === 'json') return { tree: JSON.parse(text) };
    if (inExt === 'yaml') {
      const YAML = await import('yaml');
      const docs = YAML.parseAllDocuments(text);
      const errors = docs.flatMap((d) => d.errors);
      if (errors.length) throw errors[0];
      return { tree: docs.length === 1 ? docs[0].toJS() : docs.map((d) => d.toJS()) };
    }
    if (inExt === 'xml') {
      const { XMLParser, XMLValidator } = await import('fast-xml-parser');
      const valid = XMLValidator.validate(text);
      if (valid !== true) throw new Error(valid.err?.msg);
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', ignoreDeclaration: true, ignorePiTags: true });
      return { tree: parser.parse(text) };
    }
  } catch (err) {
    const detail = err?.message ? ` (${String(err.message).split('\n')[0].slice(0, 120)})` : '';
    throw new UserError(`Este ${inExt.toUpperCase()} tem um erro de sintaxe${detail}.`);
  }
  throw new UserError('Formato de dados não suportado.');
}

function read(file, inExt) {
  if (inExt === 'csv' || inExt === 'tsv') return readDelimited(file, inExt);
  if (inExt === 'xlsx') return readXlsx(file);
  return readTree(file, inExt);
}

// ---------- Escrita ----------

function cellText(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return isoDate(v);
  return String(v);
}

async function writeDelimited(sheets, file, outExt, settings) {
  const Papa = (await import('papaparse')).default;
  const delimiter = outExt === 'tsv' ? '\t' : settings.csvDelimiter || ',';
  const results = sheets.map((s) => {
    const text = Papa.unparse({ fields: s.headers, data: s.rows.map((r) => s.headers.map((h) => cellText(r[h]))) }, { delimiter });
    // O BOM faz o Excel reconhecer acentos (UTF-8) ao abrir o CSV.
    const body = outExt === 'csv' ? `﻿${text}` : text;
    const name = sheets.length === 1 ? outName(file.name, outExt) : `${baseName(file.name)}-${s.name}.${outExt}`;
    return { name, blob: new Blob([body], { type: `text/${outExt === 'csv' ? 'csv' : 'tab-separated-values'};charset=utf-8` }) };
  });
  return [await packResults(results, file.name)];
}

function sheetName(name, used) {
  let n = String(name).replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Planilha';
  for (let i = 2; used.has(n); i++) n = `${n.slice(0, 28)} ${i}`;
  used.add(n);
  return n;
}

async function writeXlsx(sheets, file, typeValues) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const used = new Set();
  const data = sheets.map((s) => ({
    sheet: sheetName(s.name, used),
    stickyRowsCount: 1,
    dateFormat: 'dd/mm/yyyy',
    columns: s.headers.map((h) => ({ width: Math.min(Math.max(h.length + 2, 10), 40) })),
    data: [
      s.headers.map((h) => ({ value: h, fontWeight: 'bold' })),
      ...s.rows.map((r) =>
        s.headers.map((h) => {
          const v = typeValues ? typed(r[h]) : r[h];
          return v === undefined || v === '' ? null : v;
        }),
      ),
    ],
  }));
  const blob = await writeXlsxFile(data).toBlob();
  return [{ name: outName(file.name, 'xlsx'), blob }];
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function writeHtmlTable(sheets, file) {
  const body = sheets
    .map((s) => {
      const head = s.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
      const rows = s.rows.map((r) => `<tr>${s.headers.map((h) => `<td>${escapeHtml(cellText(r[h]))}</td>`).join('')}</tr>`).join('\n');
      const title = sheets.length > 1 ? `<h2>${escapeHtml(s.name)}</h2>\n` : '';
      return `${title}<table>\n<thead><tr>${head}</tr></thead>\n<tbody>\n${rows}\n</tbody>\n</table>`;
    })
    .join('\n');
  const html = wrapHtml(body, baseName(file.name));
  return [{ name: outName(file.name, 'html'), blob: new Blob([html], { type: 'text/html;charset=utf-8' }) }];
}

// Nomes de tag XML não podem ter espaço nem começar com número.
function xmlSafeKeys(v) {
  if (Array.isArray(v)) return v.map(xmlSafeKeys);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => {
        if (k.startsWith('@') || k === '#text') return [k, xmlSafeKeys(x)];
        let key = k.replace(/[^\p{L}\p{N}_.-]/gu, '_');
        if (!/^[\p{L}_]/u.test(key) || /^xml/i.test(key)) key = `_${key}`;
        return [key, xmlSafeKeys(x)];
      }),
    );
  }
  return v;
}

async function writeXml(tree, file) {
  const { XMLBuilder } = await import('fast-xml-parser');
  let root = xmlSafeKeys(plain(tree));
  if (Array.isArray(root)) root = { dados: { item: root } };
  else if (!root || typeof root !== 'object') root = { dados: { valor: root } };
  else {
    const vals = Object.values(root);
    if (vals.length !== 1 || Array.isArray(vals[0]) || typeof vals[0] !== 'object') root = { dados: root };
  }
  const builder = new XMLBuilder({ format: true, ignoreAttributes: false, attributeNamePrefix: '@', suppressEmptyNode: true });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${builder.build(root)}`;
  return [{ name: outName(file.name, 'xml'), blob: new Blob([xml], { type: 'application/xml;charset=utf-8' }) }];
}

export async function convert(file, inExt, outExt, settings) {
  const input = await read(file, inExt);
  // CSV/TSV só têm texto; para JSON, YAML e XLSX vale a pena reconhecer números.
  const typeValues = Boolean(input.fromText);

  if (outExt === 'csv' || outExt === 'tsv' || outExt === 'xlsx' || outExt === 'html') {
    const sheets = input.sheets || treeToSheets(input.tree);
    if (!sheets.some((s) => s.rows.length)) throw new UserError('Não há linhas de dados para converter.');
    if (outExt === 'xlsx') return writeXlsx(sheets, file, typeValues);
    if (outExt === 'html') return writeHtmlTable(sheets, file);
    return writeDelimited(sheets, file, outExt, settings);
  }

  const tree = input.tree !== undefined ? input.tree : sheetsToTree(input.sheets, typeValues);
  if (outExt === 'json') {
    const text = `${JSON.stringify(plain(tree), null, 2)}\n`;
    return [{ name: outName(file.name, 'json'), blob: new Blob([text], { type: 'application/json;charset=utf-8' }) }];
  }
  if (outExt === 'yaml') {
    const YAML = await import('yaml');
    const text = YAML.stringify(plain(tree));
    return [{ name: outName(file.name, 'yaml'), blob: new Blob([text], { type: 'application/yaml;charset=utf-8' }) }];
  }
  if (outExt === 'xml') return writeXml(tree, file);
  throw new UserError('Conversão de dados não suportada.');
}
