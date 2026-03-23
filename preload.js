const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  createProject: () => ipcRenderer.invoke('dialog:createProject'),
  checkRenpyProject: (rootPath) => ipcRenderer.invoke('dialog:checkRenpyProject', rootPath),
  cancelProjectLoad: () => ipcRenderer.send('project:cancel-load'),
  loadProject: (rootPath) => ipcRenderer.invoke('project:load', rootPath),
  refreshProjectTree: (rootPath) => ipcRenderer.invoke('project:refresh-tree', rootPath),
  writeFile: (filePath, content, encoding) => ipcRenderer.invoke('fs:writeFile', filePath, content, encoding),
  createDirectory: (dirPath) => ipcRenderer.invoke('fs:createDirectory', dirPath),
  removeEntry: (entryPath) => ipcRenderer.invoke('fs:removeEntry', entryPath),
  moveFile: (oldPath, newPath) => ipcRenderer.invoke('fs:moveFile', oldPath, newPath),
  copyEntry: (sourcePath, destPath) => ipcRenderer.invoke('fs:copyEntry', sourcePath, destPath),
  scanDirectory: (dirPath) => ipcRenderer.invoke('fs:scanDirectory', dirPath),
  onMenuCommand: (callback) => {
    const subscription = (_event, ...args) => callback(...args);
    ipcRenderer.on('menu-command', subscription);

    return () => {
      ipcRenderer.removeListener('menu-command', subscription);
    };
  },
  // --- Exit confirmation flow ---
  onCheckUnsavedChangesBeforeExit: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('check-unsaved-changes-before-exit', subscription);
    return () => ipcRenderer.removeListener('check-unsaved-changes-before-exit', subscription);
  },
  replyUnsavedChangesBeforeExit: (hasUnsaved) => {
    ipcRenderer.send('reply-unsaved-changes-before-exit', hasUnsaved);
  },
  onShowExitModal: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('show-exit-modal', subscription);
    return () => ipcRenderer.removeListener('show-exit-modal', subscription);
  },
  onSaveIdeStateBeforeQuit: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('save-ide-state-before-quit', subscription);
    return () => ipcRenderer.removeListener('save-ide-state-before-quit', subscription);
  },
  ideStateSavedForQuit: () => {
    ipcRenderer.send('ide-state-saved-for-quit');
  },
  forceQuit: () => {
    ipcRenderer.send('force-quit');
  },
  // --- Game Execution ---
  selectRenpy: () => ipcRenderer.invoke('dialog:selectRenpy'),
  runGame: (renpyPath, projectPath) => ipcRenderer.send('game:run', renpyPath, projectPath),
  stopGame: () => ipcRenderer.send('game:stop'),
  checkRenpyPath: (path) => ipcRenderer.invoke('renpy:check-path', path),
  onGameStarted: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('game-started', subscription);
    return () => ipcRenderer.removeListener('game-started', subscription);
  },
  onGameStopped: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('game-stopped', subscription);
    return () => ipcRenderer.removeListener('game-stopped', subscription);
  },
  onGameError: (callback) => {
    const subscription = (_event, error) => callback(error);
    ipcRenderer.on('game-error', subscription);
    return () => ipcRenderer.removeListener('game-error', subscription);
  },
  // --- App Settings ---
  getAppSettings: () => ipcRenderer.invoke('app:get-settings'),
  saveAppSettings: (settings) => ipcRenderer.invoke('app:save-settings', settings),
  // --- Path utils ---
  path: {
    join: (...args) => ipcRenderer.invoke('path:join', ...args),
  },
  // --- Search ---
  searchInProject: (options) => ipcRenderer.invoke('project:search', options),
  // --- Dialogs ---
  showSaveDialog: (options) => ipcRenderer.invoke('dialog:showSaveDialog', options),
  // --- Secure API key access ---
  loadApiKeys: () => ipcRenderer.invoke('app:load-api-keys'),
  saveApiKey: (provider, key) => ipcRenderer.invoke('app:save-api-key', provider, key),
  getApiKey: (provider) => ipcRenderer.invoke('app:get-api-key', provider),
  // --- Auto-updater ---
  onUpdateAvailable: (callback) => {
    const subscription = (_event, version) => callback(version);
    ipcRenderer.on('update-available', subscription);
    return () => ipcRenderer.removeListener('update-available', subscription);
  },
  onUpdateNotAvailable: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('update-not-available', subscription);
    return () => ipcRenderer.removeListener('update-not-available', subscription);
  },
  onUpdateError: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('update-error', subscription);
    return () => ipcRenderer.removeListener('update-error', subscription);
  },
  onUpdateDownloaded: (callback) => {
    const subscription = (_event, version) => callback(version);
    ipcRenderer.on('update-downloaded', subscription);
    return () => ipcRenderer.removeListener('update-downloaded', subscription);
  },
  installUpdate: () => ipcRenderer.send('install-update'),
  // --- Shell ---
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
});
