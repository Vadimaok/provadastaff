const { app, BrowserWindow, shell, Menu, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const https = require('node:https');

const APP_VERSION = require('./package.json').version;
const APP_URL = \`https://vadimaok.github.io/provadastaff/?desktopVersion=\${encodeURIComponent(APP_VERSION)}\`;
const APP_HOST = 'vadimaok.github.io';
const RELEASES_URL = 'https://github.com/Vadimaok/provadastaff/releases/latest';
const BOUNDS_FILE = path.join(app.getPath('userData'), 'window-bounds.json');
const DEFAULT_BOUNDS = { width: 1440, height: 960 };
let mainWindow;
let updateNoticeShown = false;

function readWindowState() {
  try {
    const saved = JSON.parse(fs.readFileSync(BOUNDS_FILE, 'utf8'));
    const displays = require('electron').screen.getAllDisplays();
    const visible = displays.some(d => {
      const a = d.workArea;
      return saved.x < a.x + a.width && saved.x + saved.width > a.x &&
        saved.y < a.y + a.height && saved.y + saved.height > a.y;
    });
    if (Number.isFinite(saved.width) && Number.isFinite(saved.height) && visible) {
      return { ...saved, width: Math.max(1024, saved.width), height: Math.max(700, saved.height) };
    }
  } catch {}
  return { ...DEFAULT_BOUNDS };
}

let saveBoundsTimer;
function writeWindowState(win) {
  if (!win || win.isDestroyed() || win.isMaximized() || win.isMinimized()) return;
  try {
    fs.mkdirSync(path.dirname(BOUNDS_FILE), { recursive: true });
    fs.writeFileSync(BOUNDS_FILE, JSON.stringify(win.getBounds()), 'utf8');
  } catch (error) { console.warn('Could not save window bounds:', error.message); }
}
function saveWindowState(win) {
  if (!win || win.isDestroyed() || win.isMaximized() || win.isMinimized()) return;
  clearTimeout(saveBoundsTimer);
  saveBoundsTimer = setTimeout(() => writeWindowState(win), 250);
}

const DESKTOP_CSS = \`
  html, body { min-height: 100% !important; }
  body { padding: clamp(12px, 1.5vw, 28px) !important; }
  .wrap, #dashboardTiles, .dashboard-tiles { width: 100% !important; max-width: none !important; margin-left: auto !important; margin-right: auto !important; }
  .panel { width: min(960px, calc(100vw - 32px)) !important; max-width: calc(100vw - 32px) !important; max-height: calc(100vh - 32px) !important; bottom: 16px !important; left: 50% !important; right: auto !important; transform: translateX(-50%) !important; border-radius: 22px !important; padding: clamp(16px, 1.8vw, 28px) !important; }
  .panel .grab { display: none !important; }
  #settingsSheet .settings-panel { position: absolute !important; left: 50% !important; right: auto !important; top: 50% !important; bottom: auto !important; transform: translate(-50%, -50%) !important; width: min(760px, calc(100vw - 64px)) !important; max-width: calc(100vw - 64px) !important; max-height: calc(100vh - 64px) !important; height: auto !important; overflow-x: hidden !important; overflow-y: auto !important; box-sizing: border-box !important; border-radius: 26px !important; }
  #settingsDesktopVersion { display: inline-flex; align-items: center; gap: 6px; width: fit-content; margin-top: 8px; padding: 5px 9px; border: 1px solid rgba(148,163,184,.2); border-radius: 9px; color: var(--muted); font-size: 11px; letter-spacing: .02em; }
  #settingsDesktopVersion strong { color: var(--text); }
  .fab { right: clamp(16px, 2vw, 32px) !important; bottom: clamp(16px, 2vw, 32px) !important; }
  .toast { bottom: 24px !important; }
  .profilebar { margin-bottom: 20px !important; }
  button, input, select, textarea { font-size: 15px; }
  button { transition: filter .16s ease, border-color .16s ease, background-color .16s ease; }
  button:hover { filter: brightness(1.08); }
  button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .sheet, .confirm-sheet { overscroll-behavior: contain; }
  .sheet .panel, .confirm-sheet .confirm-panel { scrollbar-width: thin; scrollbar-color: rgba(148,163,184,.45) transparent; overflow-x: hidden !important; overflow-y: auto !important; overscroll-behavior: contain; }
  @media (min-width: 900px) {
    .hero { padding: clamp(22px, 2.4vw, 38px) !important; border-radius: 26px !important; }
    .grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: clamp(14px, 1.4vw, 24px) !important; margin-top: 18px !important; }
    .card { min-width: 0 !important; padding: clamp(16px, 1.5vw, 26px) !important; border-radius: 24px !important; }
    .feature-grid { width: 100% !important; max-width: none !important; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)) !important; gap: clamp(12px, 1.4vw, 22px) !important; margin-top: 18px !important; }
    .feature-card { min-width: 0 !important; padding: clamp(16px, 1.5vw, 26px) !important; }
  }
  @media (max-width: 1100px) { body { padding: 12px !important; } .grid { grid-template-columns: minmax(0, 1fr) !important; } .feature-grid { grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)) !important; } }
\`;

function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return Math.sign(d); }
  return 0;
}
function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const req = https.get('https://api.github.com/repos/Vadimaok/provadastaff/releases/latest', {
      headers: { 'User-Agent': 'Provoda-Staff-Desktop', 'Accept': 'application/vnd.github+json' },
      timeout: 5000
    }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => body += chunk);
      response.on('end', () => {
        try {
          if (response.statusCode !== 200) throw new Error('Release lookup failed');
          resolve(JSON.parse(body));
        } catch (error) { reject(error); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Release check timeout')));
    req.on('error', reject);
  });
}
async function checkForUpdates() {
  if (updateNoticeShown) return;
  try {
    const release = await fetchLatestRelease();
    const latest = String(release.tag_name || '').replace(/^v/, '');
    if (!/^\d+\.\d+\.\d+$/.test(latest) || compareVersions(latest, APP_VERSION) <= 0) return;
    updateNoticeShown = true;
    const choice = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Доступно обновление Provoda Staff',
      message: \`Вышла версия \${latest}\`,
      detail: \`Установлена версия \${APP_VERSION}. Обновление содержит улучшения и исправления. Открыть страницу загрузки?\`,
      buttons: ['Открыть загрузку', 'Позже'],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    });
    if (choice.response === 0) await shell.openExternal(release.html_url || RELEASES_URL);
  } catch (error) { console.info('Update check skipped:', error.message); }
}

function openMainWindow() {
  const state = readWindowState();
  mainWindow = new BrowserWindow({
    ...state,
    minWidth: 1024,
    minHeight: 700,
    title: 'Provoda Staff',
    icon: path.join(__dirname, 'provoda-icon.ico'),
    backgroundColor: '#0b0f14',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    setTimeout(checkForUpdates, 1800);
  });
  mainWindow.on('resize', () => saveWindowState(mainWindow));
  mainWindow.on('move', () => saveWindowState(mainWindow));
  mainWindow.webContents.on('did-finish-load', async () => {
    try {
      await mainWindow.webContents.insertCSS(DESKTOP_CSS);
      await mainWindow.webContents.executeJavaScript(\`
        (() => {
          const version = \${JSON.stringify(APP_VERSION)};
          const addVersion = () => {
            const heading = document.querySelector('#settingsSheet .settings-title-row');
            if (!heading || document.getElementById('settingsDesktopVersion')) return;
            const badge = document.createElement('div');
            badge.id = 'settingsDesktopVersion';
            badge.innerHTML = '<span>Windows</span><strong>v' + version + '</strong>';
            (heading.querySelector('div') || heading).appendChild(badge);
          };
          addVersion();
          const observer = new MutationObserver(addVersion);
          observer.observe(document.documentElement, { childList: true, subtree: true });
        })();
      \`);
    } catch (error) { console.info('Desktop styling skipped:', error.message); }
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
  mainWindow.on('close', () => { clearTimeout(saveBoundsTimer); writeWindowState(mainWindow); });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadURL(APP_URL);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  openMainWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) openMainWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
