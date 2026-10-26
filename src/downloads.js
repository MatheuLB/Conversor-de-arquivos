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

export function setupDownloads() {
  const repo = import.meta.env.VITE_GITHUB_REPO;
  const os = currentOs();
  const note = document.querySelector('#platforms-note');

  for (const a of document.querySelectorAll('.platform')) {
    const target = a.dataset.os;
    a.classList.toggle('is-current', target === os);
    if (repo) {
      a.href = `https://github.com/${repo}/releases/latest/download/${FILES[target]}`;
    } else {
      a.href = '#baixar';
      a.addEventListener('click', (e) => e.preventDefault());
      a.setAttribute('aria-disabled', 'true');
    }
  }

  if (repo) {
    for (const a of document.querySelectorAll('[data-portable]')) {
      a.href = `https://github.com/${repo}/releases/latest/download/${PORTABLE[a.dataset.portable]}`;
    }
    document.querySelector('#portable').hidden = false;
  }

  if (!repo) {
    note.textContent = 'Os instaladores aparecem aqui depois que a primeira versão for publicada no GitHub.';
  } else if (os === 'mac') {
    note.textContent = 'No Mac, se aparecer um aviso na primeira vez, abra Ajustes do Sistema → Privacidade e Segurança e clique em “Abrir Mesmo Assim”.';
  } else if (os === 'windows') {
    note.textContent = 'Se o Windows mostrar “O Windows protegeu o computador”, clique em “Mais informações” e depois em “Executar assim mesmo”.';
  }
}
