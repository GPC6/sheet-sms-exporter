import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from './shared';

const api: DesktopApi = {
  state: () => ipcRenderer.invoke('state'),
  login: () => ipcRenderer.invoke('login'),
  cancelLogin: () => ipcRenderer.invoke('cancel-login'),
  logout: () => ipcRenderer.invoke('logout'),
  chooseFolder: () => ipcRenderer.invoke('choose-folder'),
  loadSheet: url => ipcRenderer.invoke('load-sheet', url),
  preview: input => ipcRenderer.invoke('preview', input),
  export: input => ipcRenderer.invoke('export', input),
  openOutput: () => ipcRenderer.invoke('open-output'),
};
contextBridge.exposeInMainWorld('desktop', api);
