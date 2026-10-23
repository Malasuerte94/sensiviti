import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron';
import { mkdirSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { initialState, parseState } from '../src/core/schema';
import type { AppState } from '../src/core/types';
import { profileDirectory } from './profile';

app.setName('Sensiviti');
const profile = profileDirectory(app.getPath('appData'), process.env.SENSIVITI_DATA_DIR);
mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
let window: BrowserWindow | null = null;
let saveQueue: Promise<void> = Promise.resolve();
const dataFile = () => path.join(app.getPath('userData'), 'sensiviti.json');
async function readState(file = dataFile()): Promise<AppState> {
  try {
    const info = await stat(file);
    if (info.size > 16 * 1024 * 1024) throw new Error('Backup is too large (maximum 16 MB).');
    return parseState(JSON.parse(await readFile(file, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && file === dataFile())
      return initialState();
    throw new Error(
      'Could not read saved data. Import a valid backup or retry. Your existing file has been preserved.',
      { cause: error },
    );
  }
}
async function writeState(input: unknown): Promise<void> {
  const state = parseState(input);
  const save = async () => {
    const json = JSON.stringify(state);
    if (Buffer.byteLength(json) > 16 * 1024 * 1024)
      throw new Error(
        'Your profile exceeds 16 MB. Export a backup before starting a fresh local profile.',
      );
    await mkdir(app.getPath('userData'), { recursive: true });
    const temp = `${dataFile()}.tmp`;
    await writeFile(temp, json, 'utf8');
    await rename(temp, dataFile());
  };
  const operation = saveQueue.then(save);
  saveQueue = operation.catch(() => {});
  return operation;
}
function trusted(event: Electron.IpcMainInvokeEvent) {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame
  )
    throw new Error('Untrusted request');
}
const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();
app.on('second-instance', () => {
  if (window) {
    if (window.isMinimized()) window.restore();
    window.focus();
  }
});
if (hasLock)
  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback) =>
      callback(
        contents === window?.webContents && ['pointerLock', 'fullscreen'].includes(permission),
      ),
    );
    session.defaultSession.setPermissionCheckHandler(
      (contents, permission) =>
        contents === window?.webContents && ['pointerLock', 'fullscreen'].includes(permission),
    );
    window = new BrowserWindow({
      width: 1440,
      height: 980,
      minWidth: 1000,
      minHeight: 720,
      title: 'Sensiviti',
      backgroundColor: '#0b1014',
      autoHideMenuBar: true,
      icon: path.join(__dirname, '../build/icon.ico'),
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        backgroundThrottling: true,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    ipcMain.handle('state:load', (event) => {
      trusted(event);
      return readState();
    });
    ipcMain.handle('profile:info', (event) => {
      trusted(event);
      return { directory: profile, file: dataFile() };
    });
    ipcMain.handle('profile:open', async (event) => {
      trusted(event);
      const error = await shell.openPath(profile);
      if (error) throw new Error('Could not open your saved-data folder.');
    });
    ipcMain.handle('state:save', (event, state: unknown) => {
      trusted(event);
      return writeState(state);
    });
    ipcMain.handle('state:export', async (event) => {
      trusted(event);
      await saveQueue;
      const result = await dialog.showSaveDialog(window!, {
        title: 'Export Sensiviti backup',
        defaultPath: 'sensiviti-backup.json',
        filters: [{ name: 'Sensiviti backup', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePath) return false;
      const state = await readState();
      await writeFile(result.filePath, JSON.stringify(state), 'utf8');
      return true;
    });
    ipcMain.handle('state:import', async (event) => {
      trusted(event);
      const result = await dialog.showOpenDialog(window!, {
        title: 'Import Sensiviti backup',
        properties: ['openFile'],
        filters: [{ name: 'Sensiviti backup', extensions: ['json'] }],
      });
      if (result.canceled) return null;
      return readState(result.filePaths[0]);
    });
    ipcMain.handle('window:fullscreen', (event, value: unknown) => {
      trusted(event);
      if (typeof value !== 'boolean') throw new Error('Invalid fullscreen value');
      window!.setFullScreen(value);
    });
    if (process.env.SENSIVITI_DEV_URL && !app.isPackaged)
      void window.loadURL(process.env.SENSIVITI_DEV_URL);
    else void window.loadFile(path.join(__dirname, '../dist/index.html'));
    window.on('closed', () => {
      window = null;
    });
  });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  /* Each trial is committed before proceeding; no deferred shutdown writes. */
});
