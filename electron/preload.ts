import { contextBridge, ipcRenderer } from 'electron';
import type { AppState, DesktopAPI } from '../src/core/types';
const api: DesktopAPI = {
  profileInfo: () => ipcRenderer.invoke('profile:info'),
  openProfileFolder: () => ipcRenderer.invoke('profile:open'),
  load: () => ipcRenderer.invoke('state:load'),
  save: (state: AppState) => ipcRenderer.invoke('state:save', state),
  exportBackup: () => ipcRenderer.invoke('state:export'),
  importBackup: () => ipcRenderer.invoke('state:import'),
  fullscreen: (value) => ipcRenderer.invoke('window:fullscreen', value),
};
contextBridge.exposeInMainWorld('sensiviti', api);
