// Ícones em traço (24×24), desenhados com a cor do texto em volta.
const PATHS = {
  upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><path d="M12 16.5v.01"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
  sliders: '<path d="M4 7h9"/><path d="M17 7h3"/><circle cx="15" cy="7" r="2"/><path d="M4 17h3"/><path d="M11 17h9"/><circle cx="9" cy="17" r="2"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  printer: '<path d="M7 9V4h10v5"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v6H7z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  zip: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M10 9h1M10 12h1M10 15h1"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  wifiOff: '<path d="M2 8.5a16 16 0 0 1 4.5-2.7"/><path d="M10.7 5.1A16 16 0 0 1 22 8.5"/><path d="M5 12.5a11 11 0 0 1 3.5-2"/><path d="M15.5 10.7a11 11 0 0 1 3.5 1.8"/><path d="M8.5 16a6 6 0 0 1 7 0"/><path d="M12 20h.01"/><path d="m3 3 18 18"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4.5-4.5L6 21"/>',
  pdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  video: '<rect x="2.5" y="5" width="14" height="14" rx="2.5"/><path d="m16.5 10 5-3v10l-5-3"/>',
  audio: '<path d="M9 18V5.5l11-2V16"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 9h1M9 13h6M9 17h6"/>',
  data: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 10h18M3 15h18M10 4v16"/>',
};

export function iconSvg(name, cls = 'icon') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`;
}

export function icon(name, cls) {
  const t = document.createElement('template');
  t.innerHTML = iconSvg(name, cls);
  return t.content.firstChild;
}

// Troca <span data-icon="nome"> do HTML pelo ícone.
export function hydrateIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) {
    el.replaceWith(icon(el.dataset.icon, el.className ? `icon ${el.className}` : 'icon'));
  }
}
