const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nexadeskDesktop", {
  selectDirectory(options) {
    return ipcRenderer.invoke("nexadesk:select-directory", options ?? {});
  }
});
