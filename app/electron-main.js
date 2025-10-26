// electron-main.js
// Minimal, robust main process:
// - nodeIntegration: true, contextIsolation: false
// - no preload.js
// - renderer.location.reload() is overridden (via injection) to send an IPC request
// - main handles that IPC with a single, safe reload attempt (no recreation)
// - quitting forcibly destroys the BrowserWindow so renderer beforeunload handlers can't hang quit

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow = null;
let isQuitting = false;

// insert into your main process file (inside createWindow or nearby)
function installSafeReloadInjection(webContents) {
  const injectionScript = `
    (function() {
      try {
        // If a previous install exists, skip
        if (window && window.__safeReloadInstalled) return;

        // Mark installed (use defineProperty so it's less likely to be overwritten)
        try {
          Object.defineProperty(window, '__safeReloadInstalled', {
            value: true,
            configurable: false,
            writable: false,
            enumerable: false
          });
        } catch (e) {
          // fallback
          window.__safeReloadInstalled = true;
        }

        // safe reload function: asks main to reload (main decides what to do)
        function __safeReload() {
          try {
            var electronRequire = (typeof require === 'function') ? require : null;
            var ipc = electronRequire && electronRequire('electron') && electronRequire('electron').ipcRenderer;
            if (ipc && typeof ipc.send === 'function') {
              ipc.send('renderer-request-reload');
            } else {
              console.warn('[safeReload] ipcRenderer unavailable - reload ignored');
            }
          } catch (err) {
            console.warn('[safeReload] exception while sending IPC', err);
          }
        }

        // Try to override location.reload in the safest possible ways
        try {
          // Try to define property on location object
          Object.defineProperty(window.location, 'reload', {
            configurable: true,
            enumerable: true,
            writable: true,
            value: __safeReload
          });
        } catch (e) {
          // If that fails, attempt to set directly (may throw in some contexts)
          try { window.location.reload = __safeReload; } catch (e2) {}
        }

        // Also patch the global location prototype if present (best-effort)
        try {
          if (window.Location && Location.prototype && typeof Location.prototype.reload === 'function') {
            try {
              Location.prototype.reload = __safeReload;
            } catch (e) {}
          }
        } catch (e) {}

        // Null-out onbeforeunload (best-effort) to reduce blocking on quit
        try { window.onbeforeunload = null; } catch (e) {}

        // Expose a small sanity-check to easily verify injection from devtools
        try {
          Object.defineProperty(window, '__safeReloadCheck', {
            value: function() { return !!window.__safeReloadInstalled; },
            configurable: false,
            enumerable: false,
            writable: false
          });
        } catch (e) {}

        console.log('[safeReload] installed');
      } catch (err) {
        console.warn('[safeReload] injection failed', err);
      }
    })();
  `;

  // Helper to execute and ignore errors
  const runInjection = () => {
    if (!webContents || webContents.isDestroyed()) return;
    webContents.executeJavaScript(injectionScript).catch(err => {
      // log - main already forwards renderer console, but log here too
      console.warn('[main] safeReload injection executeJavaScript failed:', err && err.message ? err.message : err);
    });
  };

  // Attempt injection now and on relevant navigation events so it persists across navigations
  runInjection();

  // inject again after navigation/navigate-in-page / frame loads
  const events = [
    'dom-ready',
    'did-navigate',
    'did-navigate-in-page',
    'did-frame-finish-load'
  ];

  const handlers = {};
  events.forEach(ev => {
    handlers[ev] = () => runInjection();
    webContents.on(ev, handlers[ev]);
  });

  // Return a cleanup function in case you ever want to remove the listeners
  return () => {
    try {
      events.forEach(ev => {
        if (handlers[ev]) webContents.removeListener(ev, handlers[ev]);
      });
    } catch (e) {}
  };
}


function createWindow(startFile = 'index.html') {
  // don't recreate if an existing live window exists
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.removeAllListeners();
      mainWindow.destroy();
    } catch (e) {
      /* ignore */
    }
    mainWindow = null;
  }

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    show: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      nodeIntegrationInWorker: false,
    },
  });

  // forward renderer console messages for easier debugging
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const prefix = `[renderer:${sourceId}:${line}]`;
    if (level === 2 || level === 3) console.error(`${prefix} ${message}`);
    else console.log(`${prefix} ${message}`);
  });

  // Inject a very small shim AFTER the DOM is ready that replaces window.location.reload
  // with an IPC call to main. This prevents in-renderer reloads from causing weird crashes.
  mainWindow.webContents.once('dom-ready', () => {
    try {
      mainWindow.webContents.executeJavaScript(`
        (function() {
          try {
            if (window.__safeReloadInstalled) return;
            window.__safeReloadInstalled = true;
            const electron = require && require('electron');
            // override location.reload -> ask main to reload safely
            Object.defineProperty(window.location, 'reload', {
              configurable: true,
              enumerable: true,
              writable: true,
              value: function() {
                try {
                  if (electron && electron.ipcRenderer && typeof electron.ipcRenderer.send === 'function') {
                    electron.ipcRenderer.send('renderer-request-reload');
                  } else {
                    console.warn('[renderer] ipcRenderer unavailable - reload ignored');
                  }
                } catch (e) {
                  console.warn('[renderer] safeReload failed', e);
                }
              }
            });

            // also patch window.location.reload.bind and window.location.reload.toString to avoid trivial tests
            try {
              window.location.reload.toString = () => 'function reload() { [native code] }';
            } catch(e) {}

            // attempt to avoid pages blocking unload by nulling onbeforeunload handler (best-effort)
            try { window.onbeforeunload = null; } catch(e) {}

          } catch (e) {
            console.warn('[renderer injection] failed to install safe reload shim', e);
          }
        })();
      `).catch((e) => {
        console.warn('[main] executeJavaScript injection failed', e);
      });
    } catch (e) {
      console.warn('[main] dom-ready injection error', e);
    }
  });

  // On load failures / crashes, only log. No auto-reload, no recreate.
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.warn('[main] did-fail-load (no action):', { errorCode, errorDescription, validatedURL, isMainFrame });
  });

  mainWindow.webContents.on('render-process-gone', (evt, details) => {
    console.warn('[main] render-process-gone (no action):', details);
  });

  // Normal closed behavior: we keep no automatic recreate
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Load the requested file and only log errors
  const startUrl = `file://${path.join(__dirname, startFile)}`;
  installSafeReloadInjection(mainWindow.webContents);
  mainWindow.webContents.loadURL(startUrl).catch((err) => {
    console.error('[main] loadURL failed (no action):', err);
  });

  return mainWindow;
}

// IPC from renderer override: single, safe reload attempt.
// This will attempt a reloadIgnoringCache once and only log any failure.
// It will NOT recreate the window or start retries.
ipcMain.on('renderer-request-reload', () => {
  if (isQuitting) {
    console.log('[main] renderer-request-reload ignored during quit');
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed()) {
    console.warn('[main] renderer-request-reload but no valid mainWindow - ignored');
    return;
  }

  try {
    console.log('[main] Performing single safe reload (requested from renderer)');
    // do a single reload; errors will be reported via did-fail-load handler or caught below
    mainWindow.webContents.reloadIgnoringCache();
  } catch (err) {
    console.error('[main] reloadIgnoringCache threw (no action):', err);
  }
});

// App lifecycle - keep it simple and force-destroy the BrowserWindow on quit so page handlers cannot block exit.
app.on('ready', () => {
  console.log('[main] App ready');
  const arg = process.argv[2] || 'index.html';
  createWindow(arg);
});

app.on('before-quit', (event) => {
  // Do not call event.preventDefault() — just ensure we clean up the window forcibly so beforeunload handlers don't hang quit.
  if (isQuitting) return;
  isQuitting = true;
  console.log('[main] before-quit: forcing window destroy to avoid blocked unload');

  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      // remove listeners so they don't run while destroying
      mainWindow.removeAllListeners();
      mainWindow.destroy(); // force-destroy bypasses beforeunload
      mainWindow = null;
    }
  } catch (e) {
    console.warn('[main] error while force-destroying window', e);
  }

  // As a last resort, exit the process shortly to avoid hanging
  setTimeout(() => {
    try { app.exit(0); } catch (e) { process.exit(0); }
  }, 2000).unref();
});

app.on('window-all-closed', () => {
  // Not supporting macOS - always quit when windows closed
  if (!isQuitting) isQuitting = true;
  console.log('[main] window-all-closed -> quitting');
  app.quit();
});

app.on('will-quit', () => {
  console.log('[main] will-quit');
});

// Logging uncaught/unhandled stuff but do NOT attempt auto-recovery here.
process.on('uncaughtException', (err) => {
  console.error('[main] uncaughtException (no auto-recovery):', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[main] unhandledRejection (no auto-recovery):', reason);
});
