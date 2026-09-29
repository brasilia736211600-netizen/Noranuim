import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'
import type { ElectronAPI } from '@electron-toolkit/preload'
import youTubeGuard from 'nora/assets/scripts/youtube.bjs?raw'

// The webviews load this preload in the main frame only (`nodeIntegrationInSubFrames`
// stays off in the main process: it would hand Node.js to third-party iframes), so
// the guard patches the top-level page and no longer reaches embedded players (a
// YouTube video on Reddit is an iframe on youtube.com). Preloads run before the
// page's scripts, and `webFrame.executeJavaScript` reaches the page's own context --
// which is where the guard has to patch `fetch`/`XMLHttpRequest`. The guard
// no-ops on every other host.
try {
  void webFrame.executeJavaScript(youTubeGuard)
} catch (error) {
  console.error('[nora] failed to install YouTube ad guard', error)
}

// The API surface exposed on `window.electron`. It mirrors `ElectronAPI` from
// @electron-toolkit/preload, but is implemented here on purpose: the renderer now
// runs with `sandbox: true`, and a sandboxed preload can only resolve an allowlist
// of modules (`electron`, `events`, `timers`, `url`) through its `require`, so a
// runtime import of the package would throw "module not found" and take the whole
// bridge - IPC included - down with it. The package stays imported as a type only,
// so the shape cannot drift from what the renderer expects.
const electronAPI: ElectronAPI = {
  ipcRenderer: {
    send(channel, ...args) {
      ipcRenderer.send(channel, ...args)
    },
    // `ipcRenderer.sendTo` was removed in Electron 28, so callers threw back then
    // too.
    sendTo() {
      throw new Error('"sendTo" method has been removed since Electron 28.')
    },
    sendSync(channel, ...args) {
      return ipcRenderer.sendSync(channel, ...args)
    },
    sendToHost(channel, ...args) {
      ipcRenderer.sendToHost(channel, ...args)
    },
    postMessage(channel, message, transfer) {
      ipcRenderer.postMessage(channel, message, transfer)
    },
    invoke(channel, ...args) {
      return ipcRenderer.invoke(channel, ...args)
    },
    on(channel, listener) {
      ipcRenderer.on(channel, listener)
      return () => {
        ipcRenderer.removeListener(channel, listener)
      }
    },
    once(channel, listener) {
      ipcRenderer.once(channel, listener)
      return () => {
        ipcRenderer.removeListener(channel, listener)
      }
    },
    removeListener(channel, listener) {
      ipcRenderer.removeListener(channel, listener)
      return this
    },
    removeAllListeners(channel) {
      ipcRenderer.removeAllListeners(channel)
    }
  },
  webFrame: {
    insertCSS(css) {
      return webFrame.insertCSS(css)
    },
    setZoomFactor(factor) {
      if (typeof factor === 'number' && factor > 0) {
        webFrame.setZoomFactor(factor)
      }
    },
    setZoomLevel(level) {
      if (typeof level === 'number') {
        webFrame.setZoomLevel(level)
      }
    }
  },
  webUtils: {
    getPathForFile(file) {
      return webUtils.getPathForFile(file)
    }
  },
  process: {
    get platform() {
      return process.platform
    },
    get versions() {
      return process.versions
    },
    get env() {
      return { ...process.env }
    }
  }
}

// The renderer bridge stays a main-frame API. Every top-level page already had
// it; handing it to third-party iframes as well would be a new grant.
if (process.isMainFrame) {
  // Use `contextBridge` APIs to expose Electron APIs to
  // renderer only if context isolation is enabled, otherwise
  // just add to the DOM global.
  if (process.contextIsolated) {
    try {
      contextBridge.exposeInMainWorld('electron', electronAPI)
    } catch (error) {
      console.error(error)
    }
  } else {
    // @ts-ignore (define in dts)
    window.electron = electronAPI
  }
}
