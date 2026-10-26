// Processo principal do app de computador (Electron).
// O app é o mesmo site, servido de dentro do pacote pelo endereço app://converta/.
const { app, BrowserWindow, Menu, ipcMain, nativeTheme, net, protocol, shell } = require('electron');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DIST = path.join(__dirname, '..', 'dist');
const SCHEME = 'app';
const ORIGIN = `${SCHEME}://converta`;

// "standard" e "secure" fazem o endereço se comportar como um site HTTPS
// (necessário para Web Workers, WebAssembly e fetch).
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
]);

function serveDist() {
  protocol.handle(SCHEME, (request) => {
    const { pathname } = new URL(request.url);
    const file = path.normalize(path.join(DIST, decodeURIComponent(pathname === '/' ? '/index.html' : pathname)));
    if (!file.startsWith(DIST + path.sep)) return new Response('Proibido', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

let mainWindow = null;
const isMac = process.platform === 'darwin';

// Cores dos botões da janela (Windows/Linux), iguais ao cabeçalho do app.
function titleBarOverlay() {
  const dark = nativeTheme.shouldUseDarkColors;
  return { color: dark ? '#07090f' : '#f6f7fb', symbolColor: dark ? '#eef1f7' : '#0b1220', height: 60 };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 820,
    minWidth: 420,
    minHeight: 520,
    title: 'Converta',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#07090f' : '#f6f7fb',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    // Sem barra de título do sistema: o cabeçalho do app faz esse papel.
    titleBarStyle: 'hidden',
    ...(isMac ? { trafficLightPosition: { x: 18, y: 22 } } : { titleBarOverlay: titleBarOverlay() }),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Links externos abrem no navegador padrão.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(ORIGIN)) return;
    event.preventDefault();
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });

  const devServer = process.env.VITE_DEV_SERVER_URL;
  mainWindow.loadURL(devServer || `${ORIGIN}/index.html`);
  mainWindow.on('closed', () => (mainWindow = null));
}

// Documento (HTML) -> PDF usando o motor de impressão do Chromium.
// A janela oculta roda com JavaScript desligado: nada do documento é executado.
ipcMain.handle('html-to-pdf', async (event, html) => {
  const sender = event.senderFrame?.url || '';
  if (!sender.startsWith(ORIGIN) && !(process.env.VITE_DEV_SERVER_URL && sender.startsWith(process.env.VITE_DEV_SERVER_URL))) {
    throw new Error('Origem não permitida');
  }
  if (typeof html !== 'string') throw new Error('Documento inválido');
  const tmp = path.join(os.tmpdir(), `converta-${process.pid}-${Date.now()}.html`);
  await fs.writeFile(tmp, html, 'utf8');
  const win = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true, contextIsolation: true } });
  try {
    await win.loadFile(tmp);
    return await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true });
  } finally {
    win.destroy();
    fs.rm(tmp, { force: true }).catch(() => {});
  }
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  nativeTheme.on('updated', () => {
    if (!mainWindow) return;
    mainWindow.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#07090f' : '#f6f7fb');
    if (!isMac) mainWindow.setTitleBarOverlay(titleBarOverlay());
  });

  app.whenReady().then(() => {
    // No Mac o menu padrão traz Copiar/Colar e Sair; nos outros sistemas não precisamos de menu.
    if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
    serveDist();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
