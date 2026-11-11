import { contextBridge, ipcRenderer } from 'electron';
import type { AppState, DesktopAPI } from '../src/core/types';
const api: DesktopAPI = {
  updates: {
    status: () => ipcRenderer.invoke('updates:status'),
    check: () => ipcRenderer.invoke('updates:check'),
    download: () => ipcRenderer.invoke('updates:download'),
    subscribe: (listener) => {
      const receive = (
        _event: Electron.IpcRendererEvent,
        value: import('../src/core/updates').UpdateStatus,
      ) => listener(value);
      ipcRenderer.on('updates:status', receive);
      return () => ipcRenderer.removeListener('updates:status', receive);
    },
  },
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
