import { contextBridge, ipcRenderer } from 'electron';
import type { AppState, DesktopAPI } from '../src/core/types';
const api: DesktopAPI = {
  turnCapture: {
    available: process.platform === 'win32',
    start: (request) => ipcRenderer.invoke('turn:start', request),
    cancel: (id) => ipcRenderer.invoke('turn:cancel', id),
    subscribe: (listener) => {
      const receive = (
        _event: Electron.IpcRendererEvent,
        value: import('../src/core/turnMeasurement').TurnCaptureEvent,
      ) => listener(value);
      ipcRenderer.on('turn:event', receive);
      return () => ipcRenderer.removeListener('turn:event', receive);
    },
  },
  profileInfo: () => ipcRenderer.invoke('profile:info'),
  openProfileFolder: () => ipcRenderer.invoke('profile:open'),
  load: () => ipcRenderer.invoke('state:load'),
  save: (state: AppState) => ipcRenderer.invoke('state:save', state),
  exportBackup: () => ipcRenderer.invoke('state:export'),
  importBackup: () => ipcRenderer.invoke('state:import'),
  fullscreen: (value) => ipcRenderer.invoke('window:fullscreen', value),
};
contextBridge.exposeInMainWorld('sensiviti', api);
