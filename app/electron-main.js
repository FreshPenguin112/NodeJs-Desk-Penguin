// Import required modules from Electron
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

// Create a variable to store the main application window
let mainWindow;

// Function to create the main application window
function createWindow(fileToOpen = null) {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: true, // Enables Node.js integration
      contextIsolation: false, // Required for older Electron versions with nodeIntegration: true
      nodeIntegrationInWorker: true,
      nodeIntegrationInSubFrames: true
    },
  });

  let startUrl = `file://${path.join(__dirname, "index.html")}`;
  if (fileToOpen) {
    startUrl += `?project=${encodeURIComponent(fileToOpen)}`;
  }

  mainWindow.loadURL(startUrl);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Create the main window when the app is ready
app.whenReady().then(() => {
  const fileToOpen = process.argv.length >= 2 ? process.argv[1] : null;
  createWindow(fileToOpen);
});

// Quit the app when all windows are closed
app.on("window-all-closed", () => {
  app.quit();
});

// Handle the second instance of the app (for Windows/Linux)
app.on('second-instance', (event, argv) => {
  const filePath = argv.length >= 2 ? argv[1] : null;
  if (filePath && mainWindow) {
    mainWindow.loadURL(`file://${path.join(__dirname, 'index.html')}?project=${encodeURIComponent(filePath)}`);
  }
});

// IPC (Inter-Process Communication) handlers for window control
ipcMain.on("minimize-window", () => {
  mainWindow.minimize(); // Minimize the main window
});

ipcMain.on("maximize-window", () => {
  if (mainWindow.isMaximized()) {
    // If the window is maximized, unmaximize it and send an event
    mainWindow.unmaximize();
    mainWindow.webContents.send("unmaximize-window");
  } else {
    // If the window is not maximized, maximize it and send an event
    mainWindow.maximize();
    mainWindow.webContents.send("maximized-window");
  }
});

ipcMain.on("close-window", () => {
  mainWindow.close(); // Close the main window
  process.exit(0);
});
