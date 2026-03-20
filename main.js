const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

let mainWindow;
let navStack = []; // navigation history stack

const PAGE_CONFIG = {
  login:         { file: 'src/auth/login/index.html',                       minW: 780,  minH: 560, w: 900,  h: 640  },
  modules:       { file: 'src/dashboard/modules/index.html',                 minW: 1024, minH: 680, w: 1280, h: 800  },
  production:    { file: 'src/modules/production/index.html',                minW: 1024, minH: 680, w: 1280, h: 800  },
  'so-creation': { file: 'src/modules/production/so-creation/index.html',    minW: 1024, minH: 680, w: 1280, h: 800  },
};

function loadPage(name, resize) {
  const cfg = PAGE_CONFIG[name];
  if (!mainWindow || !cfg) return;
  mainWindow.loadFile(cfg.file);
  if (resize) {
    mainWindow.setMinimumSize(cfg.minW, cfg.minH);
    mainWindow.setSize(cfg.w, cfg.h, true);
    mainWindow.center();
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 640,
    minWidth: 780,
    minHeight: 560,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0a0f',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    resizable: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
  });

  navStack = [];
  loadPage('login', true);
}

// ── Navigation with history ──

ipcMain.on('navigate-to-modules', (_e, opts) => {
  const from = opts?.from;
  if (from && from !== 'login') {
    navStack.push(from);
  } else if (from === 'login') {
    navStack = []; // login is root, clear stack
  }
  loadPage('modules', true);
});

ipcMain.on('navigate-to-production', (_e, opts) => {
  if (opts?.from) navStack.push(opts.from);
  loadPage('production', false);
});

ipcMain.on('navigate-to-so-creation', (_e, opts) => {
  if (opts?.from) navStack.push(opts.from);
  loadPage('so-creation', false);
});

ipcMain.on('navigate-to-login', () => {
  navStack = [];
  loadPage('login', true);
});

ipcMain.on('navigate-back', () => {
  if (navStack.length === 0) return;
  const prev = navStack.pop();
  loadPage(prev, true);
});

// Return the previous page name (or null) so pages can show the back arrow
ipcMain.handle('get-nav-info', () => {
  return {
    previous: navStack.length > 0 ? navStack[navStack.length - 1] : null,
    stackSize: navStack.length,
  };
});

// Expose allowed env vars to renderer pages
ipcMain.handle('get-env', () => {
  return {
    API_BASE_URL: process.env.API_BASE_URL,
    MOCK_AUTH_EMAIL: process.env.MOCK_AUTH_EMAIL,
    MOCK_AUTH_PASSWORD: process.env.MOCK_AUTH_PASSWORD,
  };
});

// ── Window controls ──

ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['Cancel', 'Close'],
      defaultId: 1,
      title: 'Confirm',
      message: 'Are you sure you want to close the application?',
    });
    if (choice === 1) {
      mainWindow.destroy();
    }
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
