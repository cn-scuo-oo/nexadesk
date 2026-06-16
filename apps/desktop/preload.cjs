const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nexadeskDesktop", {
  selectDirectory(options) {
    return ipcRenderer.invoke("nexadesk:select-directory", options ?? {});
  },
  minimizeWindow() {
    ipcRenderer.send("nexadesk:window:minimize");
  },
  toggleMaximizeWindow() {
    ipcRenderer.send("nexadesk:window:toggle-maximize");
  },
  closeWindow() {
    ipcRenderer.send("nexadesk:window:close");
  }
});
