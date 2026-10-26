// Links da seção "Baixar o app". Os instaladores ficam nas Releases do GitHub,
// com nomes fixos (veja "build" no package.json), então o link "latest" sempre aponta para a versão mais nova.
//
// O repositório vem da variável VITE_GITHUB_REPO (o workflow do GitHub preenche sozinho).
// Para testar localmente: VITE_GITHUB_REPO=seu-usuario/converta npm run build

const FILES = {
  windows: 'Converta-Setup.exe',
  mac: 'Converta-mac.dmg',
  linux: 'Converta-linux.AppImage',
};

// Versões portáteis: extrair e abrir, sem instalar.
const PORTABLE = {
  windows: 'Converta-windows.zip',
  mac: 'Converta-mac.zip',
  linux: 'Converta-linux.tar.gz',
};

function currentOs() {
  const p = (navigator.userAgentData?.platform || navigator.platform || navigator.userAgent).toLowerCase();
  if (p.includes('win')) return 'windows';
  if (p.includes('mac')) return 'mac';
  if (p.includes('linux') && !/android/i.test(navigator.userAgent)) return 'linux';
  return null;
}

// Pergunta ao GitHub quais arquivos a versão mais recente já tem.
// Devolve null quando não dá para saber (sem internet, limite da API).
async function latestAssets(repo) {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (res.status === 404) return new Set();
    if (!res.ok) return null;
    const release = await res.json();
    return new Set(release.assets.map((a) => a.name));
  } catch {
    return null;
  }
}

function setLink(a, href, label) {
  const file = a.querySelector('.platform__file');
  if (file && !file.dataset.original) file.dataset.original = file.textContent;
  if (href) {
    a.href = href;
    a.removeAttribute('aria-disabled');
    a.classList.remove('is-soon');
    if (file) file.textContent = file.dataset.original;
  } else {
    a.removeAttribute('href');
    a.setAttribute('aria-disabled', 'true');
    a.classList.add('is-soon');
    if (file) file.textContent = label;
  }
}

export async function setupDownloads() {
  const repo = import.meta.env.VITE_GITHUB_REPO;
  const os = currentOs();
  const note = document.querySelector('#platforms-note');
  const cards = [...document.querySelectorAll('.platform')];
  const portables = [...document.querySelectorAll('[data-portable]')];
  const url = (file) => `https://github.com/${repo}/releases/latest/download/${file}`;

  for (const a of cards) a.classList.toggle('is-current', a.dataset.os === os);

  if (!repo) {
    cards.forEach((a) => setLink(a, null, 'Em breve'));
    note.textContent = 'Os instaladores aparecem aqui depois que a primeira versão for publicada no GitHub.';
    return;
  }

  // Enquanto a resposta não chega, os links já apontam para a versão mais recente.
  cards.forEach((a) => setLink(a, url(FILES[a.dataset.os])));
  portables.forEach((a) => setLink(a, url(PORTABLE[a.dataset.portable])));
  document.querySelector('#portable').hidden = false;
  if (os === 'mac') {
    note.textContent = 'No Mac, se aparecer um aviso na primeira vez, abra Ajustes do Sistema → Privacidade e Segurança e clique em “Abrir Mesmo Assim”.';
  } else if (os === 'windows') {
    note.textContent = 'Se o Windows mostrar “O Windows protegeu o computador”, clique em “Mais informações” e depois em “Executar assim mesmo”.';
  }

  // Arquivo que ainda não foi publicado vira "Em breve" em vez de um link quebrado.
  const assets = await latestAssets(repo);
  if (!assets) return;
  for (const a of cards) {
    const file = FILES[a.dataset.os];
    setLink(a, assets.has(file) ? url(file) : null, 'Em breve');
  }
  for (const a of portables) {
    const file = PORTABLE[a.dataset.portable];
    setLink(a, assets.has(file) ? url(file) : null);
  }
  if (!cards.some((a) => !a.classList.contains('is-soon'))) {
    note.textContent = 'A primeira versão do app está sendo preparada. Volte daqui a alguns minutos.';
  }
}
