const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('node:path');

const APP_URL = `https://vadimaok.github.io/provadastaff/?desktopVersion=${encodeURIComponent(require('./package.json').version)}`;
const APP_HOST = 'vadimaok.github.io';
const DESKTOP_CSS = `
  html, body { min-height: 100% !important; }
  body { padding: clamp(12px, 1.5vw, 28px) !important; }
  .wrap { width: 100% !important; max-width: none !important; margin-left: auto !important; margin-right: auto !important; }
  #dashboardTiles { width: 100% !important; max-width: none !important; }
  .dashboard-tiles { width: 100% !important; max-width: none !important; }
  .panel { width: min(960px, calc(100vw - 32px)) !important; max-width: calc(100vw - 32px) !important; max-height: calc(100vh - 32px) !important; bottom: 16px !important; left: 50% !important; right: auto !important; transform: translateX(-50%) !important; border-radius: 22px !important; padding: clamp(16px, 1.8vw, 28px) !important; }
  .panel .grab { display: none !important; }
  .fab { right: clamp(16px, 2vw, 32px) !important; bottom: clamp(16px, 2vw, 32px) !important; }
  .toast { bottom: 24px !important; }
  .profilebar { margin-bottom: 20px !important; }
  button, input, select, textarea { font-size: 15px; }
  button { transition: filter .16s ease, border-color .16s ease, background-color .16s ease; }
  button:hover { filter: brightness(1.08); }
  button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  @media (min-width: 900px) {
    .hero { padding: clamp(22px, 2.4vw, 38px) !important; border-radius: 26px !important; }
    .grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: clamp(14px, 1.4vw, 24px) !important; margin-top: 18px !important; }
    .card { min-width: 0 !important; padding: clamp(16px, 1.5vw, 26px) !important; border-radius: 24px !important; }
    .feature-grid { width: 100% !important; max-width: none !important; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)) !important; gap: clamp(12px, 1.4vw, 22px) !important; margin-top: 18px !important; }
    .feature-card { min-width: 0 !important; padding: clamp(16px, 1.5vw, 26px) !important; }
  }
  @media (max-width: 1100px) {
    body { padding: 12px !important; }
    .grid { grid-template-columns: minmax(0, 1fr) !important; }
    .feature-grid { grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)) !important; }
  }
`;

let mainWindow;
function openMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    title: 'Provoda Staff',
    icon: path.join(__dirname, 'provoda-icon.ico'),
    backgroundColor: '#0b0f14',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.insertCSS(DESKTOP_CSS).catch(() => {});
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== APP_HOST && parsed.protocol !== 'file:') {
        event.preventDefault();
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') shell.openExternal(url);
      }
    } catch { event.preventDefault(); }
  });
  mainWindow.loadURL(APP_URL);
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  openMainWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) openMainWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
