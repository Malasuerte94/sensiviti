import { initialState, parseState } from './core/schema';
import type { AppState } from './core/types';
const KEY = 'sensiviti.v1';
export const storage = {
  async load(): Promise<AppState> {
    if (window.sensiviti) return window.sensiviti.load();
    const data = localStorage.getItem(KEY);
    return data ? parseState(JSON.parse(data)) : initialState();
  },
  async save(state: AppState) {
    if (window.sensiviti) await window.sensiviti.save(state);
    else localStorage.setItem(KEY, JSON.stringify(parseState(state)));
  },
  async export(state: AppState) {
    if (window.sensiviti) return window.sensiviti.exportBackup();
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(state)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sensiviti-backup.json';
    a.click();
    URL.revokeObjectURL(url);
    return true;
  },
  async import(): Promise<AppState | null> {
    if (window.sensiviti) return window.sensiviti.importBackup();
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.oncancel = () => resolve(null);
      input.onchange = async () => {
        try {
          const file = input.files?.[0];
          if (!file) return resolve(null);
          if (file.size > 16 * 1024 * 1024) throw new Error('Backup exceeds 16 MB.');
          resolve(parseState(JSON.parse(await file.text())));
        } catch (error) {
          reject(error);
        }
      };
      input.click();
    });
  },
};
