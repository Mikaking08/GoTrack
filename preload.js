'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Die Oberfläche bekommt nur diese wenigen, klar begrenzten Funktionen – keinen Zugriff auf Node.
contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('data:load'),
  save: (text) => ipcRenderer.invoke('data:save', text),
  exportFile: (text, defaultName, labels) => ipcRenderer.invoke('file:export', text, defaultName, labels),
  importFile: (labels) => ipcRenderer.invoke('file:import', labels),
  info: () => ipcRenderer.invoke('app:info'),
  showDataFolder: () => ipcRenderer.invoke('app:showData')
});
