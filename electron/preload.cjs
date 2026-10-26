// Ponte mínima entre o app e a página: só o que o site precisa saber/fazer a mais no computador.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  platform: process.platform,
  htmlToPdf: (html) => ipcRenderer.invoke('html-to-pdf', html),
});
