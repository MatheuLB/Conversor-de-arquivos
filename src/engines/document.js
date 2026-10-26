import { UserError, outName } from '../util.js';

// Estilo usado nos HTML gerados e na impressão para PDF.
const DOC_CSS = `
  body { font: 11pt/1.55 Georgia, 'Times New Roman', serif; color: #111; max-width: 46em; margin: 2em auto; padding: 0 1em; }
  h1, h2, h3, h4 { font-family: Arial, Helvetica, sans-serif; line-height: 1.25; margin: 1.4em 0 .5em; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; margin: 1em 0; }
  td, th { border: 1px solid #999; padding: .3em .6em; vertical-align: top; }
  pre, code { font-family: 'Courier New', monospace; font-size: .92em; }
  pre { white-space: pre-wrap; word-wrap: break-word; }
  blockquote { margin: 1em 0; padding-left: 1em; border-left: 3px solid #ccc; color: #444; }
  @page { margin: 2cm; }
  @media print { body { margin: 0; max-width: none; padding: 0; } }
`;

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

export function wrapHtml(body, title) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${DOC_CSS}</style>
</head>
<body>
${body}
</body>
</html>
`;
}

// ---------- Leitura: tudo vira um fragmento de HTML ----------

async function docxToHtml(file) {
  const mammoth = (await import('mammoth')).default;
  try {
    const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    return value;
  } catch {
    throw new UserError('Não foi possível ler este DOCX. Arquivos .doc antigos precisam ser salvos como .docx no Word.');
  }
}

async function mdToHtml(text) {
  const { marked } = await import('marked');
  return marked.parse(text, { gfm: true, breaks: false });
}

function textToHtml(text) {
  return `<pre>${escapeHtml(text)}</pre>`;
}

// Mantém só o <body> de um HTML e descarta scripts.
function cleanHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, noscript, iframe, object, embed').forEach((el) => el.remove());
  return doc.body.innerHTML;
}

async function readAsHtml(file, inExt) {
  switch (inExt) {
    case 'docx':
      return docxToHtml(file);
    case 'md':
      return mdToHtml(await file.text());
    case 'txt':
      return textToHtml(await file.text());
    case 'html':
      return cleanHtml(await file.text());
    default:
      throw new UserError('Formato de documento não suportado.');
  }
}

// ---------- Escrita ----------

// Parágrafos ficam separados por uma linha em branco; itens de lista e linhas de tabela, por uma quebra.
const PARAGRAPH = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DL', 'FIELDSET', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4',
  'H5', 'H6', 'HEADER', 'HR', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'UL',
]);
const LINE = new Set(['DIV', 'DT', 'DD', 'LI', 'TR']);

export function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, noscript').forEach((el) => el.remove());
  let out = '';
  let pending = 0;
  // Quebras pedidas por blocos vizinhos não se somam: vale a maior.
  const brk = (n) => {
    if (out) pending = Math.max(pending, n);
  };
  const emit = (text) => {
    if (pending) {
      if (!text.trim()) return;
      out += '\n'.repeat(pending);
      pending = 0;
    }
    out += text;
  };
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      emit(node.parentElement?.closest('pre') ? node.data : node.data.replace(/\s+/g, ' '));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName;
    if (tag === 'BR') {
      out += '\n'.repeat(Math.max(pending, 1));
      pending = 0;
      return;
    }
    // Dentro de uma célula tudo fica na mesma linha; as células são separadas por tabulação.
    const inCell = Boolean(node.parentElement?.closest('td, th'));
    const n = inCell ? 0 : PARAGRAPH.has(tag) ? 2 : LINE.has(tag) ? 1 : 0;
    brk(n);
    if (tag === 'LI') emit(node.parentElement?.tagName === 'OL' ? `${[...node.parentElement.children].indexOf(node) + 1}. ` : '• ');
    if (inCell && PARAGRAPH.has(tag) && node.previousElementSibling) emit(' ');
    node.childNodes.forEach(walk);
    if ((tag === 'TD' || tag === 'TH') && node.nextElementSibling) emit('\t');
    brk(n);
  };
  walk(doc.body);
  return `${out
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/g, '').replace(/^ +/, '').replace(/\t +/g, '\t'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;
}

function cellMarkdown(cell) {
  return cell.textContent.replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|');
}

async function htmlToMarkdown(html) {
  const TurndownService = (await import('turndown')).default;
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
  // Imagens embutidas (base64) deixariam o .md ilegível.
  td.addRule('embeddedImages', {
    filter: (node) => node.nodeName === 'IMG' && (node.getAttribute('src') || '').startsWith('data:'),
    replacement: (_, node) => (node.getAttribute('alt') ? `[imagem: ${node.getAttribute('alt')}]` : '[imagem]'),
  });
  // Tabelas no formato do GitHub; a primeira linha vira o cabeçalho.
  td.addRule('tables', {
    filter: 'table',
    replacement: (_, table) => {
      const rows = [...table.rows].map((r) => [...r.cells].map(cellMarkdown));
      if (!rows.length) return '';
      const width = Math.max(...rows.map((r) => r.length));
      const line = (cells) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`;
      const [head, ...body] = rows;
      return `\n\n${[line(head), line(Array(width).fill('---')), ...body.map(line)].join('\n')}\n\n`;
    },
  });
  return `${td.turndown(html)}\n`;
}

// Texto puro vira PDF direto com pdf-lib (fonte Helvetica, A4).
async function textToPdf(text) {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const size = 11;
  const lineHeight = size * 1.45;
  const [pw, ph] = [595.28, 841.89];
  const margin = 56;
  const maxWidth = pw - margin * 2;

  // A fonte padrão só cobre o alfabeto latino (WinAnsi); o resto vira "?".
  const safe = (s) =>
    [...s].map((ch) => {
      try {
        font.encodeText(ch);
        return ch;
      } catch {
        return '?';
      }
    }).join('');

  const lines = [];
  for (const raw of text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')) {
    const para = safe(raw);
    if (!para) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      const next = line + word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        line = next;
        continue;
      }
      if (line.trim()) lines.push(line.trimEnd());
      // Palavra maior que a linha: quebra por caractere.
      let w = word.trimStart();
      while (font.widthOfTextAtSize(w, size) > maxWidth) {
        let i = w.length;
        while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > maxWidth) i--;
        lines.push(w.slice(0, i));
        w = w.slice(i);
      }
      line = w;
    }
    lines.push(line.trimEnd());
  }

  const perPage = Math.floor((ph - margin * 2) / lineHeight);
  for (let i = 0; i < lines.length || i === 0; i += perPage) {
    const page = pdf.addPage([pw, ph]);
    lines.slice(i, i + perPage).forEach((l, j) => {
      if (l) page.drawText(l, { x: margin, y: ph - margin - size - j * lineHeight, size, font });
    });
  }
  return new Blob([await pdf.save()], { type: 'application/pdf' });
}

// HTML vira PDF pela impressão. No app de computador é automático;
// no navegador abrimos a janela de impressão para o usuário salvar como PDF.
async function htmlToPdf(fullHtml, file) {
  if (window.desktop?.htmlToPdf) {
    const bytes = await window.desktop.htmlToPdf(fullHtml);
    return [{ name: outName(file.name, 'pdf'), blob: new Blob([bytes], { type: 'application/pdf' }) }];
  }
  await printInBrowser(fullHtml);
  return [];
}

function printInBrowser(fullHtml) {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    // Sem allow-scripts: nada do documento do usuário é executado.
    frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    frame.srcdoc = fullHtml;
    frame.onload = () => {
      const win = frame.contentWindow;
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        setTimeout(() => frame.remove(), 1000);
        resolve();
      };
      win.addEventListener('afterprint', done, { once: true });
      setTimeout(done, 120_000);
      // Espera as imagens carregarem antes de imprimir.
      const imgs = [...frame.contentDocument.images].filter((i) => !i.complete);
      Promise.all(imgs.map((i) => new Promise((r) => (i.onload = i.onerror = r)))).then(() => {
        win.focus();
        win.print();
      });
    };
    document.body.append(frame);
  });
}

export async function convert(file, inExt, outExt) {
  const title = file.name.replace(/\.[^.]+$/, '');

  // No navegador, texto puro vira PDF direto. No app, o motor de impressão cobre qualquer caractere.
  if (inExt === 'txt' && outExt === 'pdf' && !window.desktop?.htmlToPdf) {
    return [{ name: outName(file.name, 'pdf'), blob: await textToPdf(await file.text()) }];
  }
  if (inExt === 'txt' && outExt === 'md') {
    return [{ name: outName(file.name, 'md'), blob: new Blob([await file.text()], { type: 'text/markdown;charset=utf-8' }) }];
  }

  const html = await readAsHtml(file, inExt);
  let content;
  switch (outExt) {
    case 'html':
      content = wrapHtml(html, title);
      break;
    case 'md':
      content = await htmlToMarkdown(html);
      break;
    case 'txt':
      content = htmlToText(html);
      break;
    case 'pdf':
      return htmlToPdf(wrapHtml(html, title), file);
    default:
      throw new UserError('Conversão de documento não suportada.');
  }
  const mime = { html: 'text/html', md: 'text/markdown', txt: 'text/plain' }[outExt];
  return [{ name: outName(file.name, outExt), blob: new Blob([content], { type: `${mime};charset=utf-8` }) }];
}
