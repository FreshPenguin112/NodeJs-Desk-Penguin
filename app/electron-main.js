// electron-main.js

const { app, BrowserWindow, ipcMain, protocol, net } = require('electron');
const path = require('path');

let mainWindow = null;
let isQuitting = false;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      allowServiceWorkers: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
  const url = new URL(request.url);

  // IMPORTANT: remove leading slash
  const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '');

  const filePath = path.join(__dirname, relativePath);

  return net.fetch(`file://${filePath}`);
});


  createWindow(process.argv[2] || 'index.html');
});

/* -------------------------------------------------- */
/* Window creation                                    */
/* -------------------------------------------------- */

function createWindow(startFile) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
    mainWindow = null;
  }

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false
    }
  });

  mainWindow.webContents.on('console-message', (_, level, message, line, sourceId) => {
    const prefix = `[renderer:${sourceId}:${line}]`;
    if (level >= 2) console.error(`${prefix} ${message}`);
    else console.log(`${prefix} ${message}`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const startUrl = `app://${startFile}`;
  mainWindow.loadURL(startUrl).catch(err => {
    console.error('[main] loadURL failed:', err);
  });
}

/* -------------------------------------------------- */
/* Safe reload (no injection needed)                  */
/* -------------------------------------------------- */

ipcMain.on('renderer-request-reload', () => {
  if (isQuitting) return;
  if (!mainWindow || mainWindow.isDestroyed()) return;

  console.log('[main] safe reload requested');
  try {
    mainWindow.webContents.reloadIgnoringCache();
  } catch (e) {
    console.error('[main] reload failed:', e);
  }
});

/* -------------------------------------------------- */
/* Quit handling                                      */
/* -------------------------------------------------- */

app.on('before-quit', () => {
  isQuitting = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
    mainWindow = null;
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

/* -------------------------------------------------- */
/* Safety logging                                     */
/* -------------------------------------------------- */

process.on('uncaughtException', err => {
  console.error('[main] uncaughtException:', err);
});

process.on('unhandledRejection', reason => {
  console.error('[main] unhandledRejection:', reason);
});
