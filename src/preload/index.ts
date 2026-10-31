import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { IPC } from '@shared/ipc'
import type { PulseApi, Settings } from '@shared/types'
import type { Activity } from '@shared/widget'

function listen<T extends unknown[]>(channel: string, cb: (...args: T) => void): () => void {
  const handler = (_e: IpcRendererEvent, ...args: unknown[]): void => cb(...(args as T))
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

// Every widget card and page subscribes to its events. One IPC listener fans them out, rather
// than one listener per subscription (which piles up past Node's listener warning).
const widgetSubscribers = new Map<string, Set<(payload: unknown) => void>>()
ipcRenderer.on(IPC.widgetEvent, (_e, id: string, name: string, payload: unknown) => {
  widgetSubscribers.get(`${id}:${name}`)?.forEach((cb) => cb(payload))
})

const api: PulseApi = {
  widgets: {
    call: (widgetId, method, ...args) => ipcRenderer.invoke(IPC.widgetCall, widgetId, method, args),
    on: (widgetId, event, cb) => {
      const key = `${widgetId}:${event}`
      let subs = widgetSubscribers.get(key)
      if (!subs) widgetSubscribers.set(key, (subs = new Set()))
      subs.add(cb)
      return () => {
        subs.delete(cb)
        if (!subs.size) widgetSubscribers.delete(key)
      }
    },
    startDrag: (widgetId, relPath) => ipcRenderer.invoke(IPC.widgetDrag, widgetId, relPath)
  },
  pathsForFiles: (files) =>
    files
      .map((f) => webUtils.getPathForFile(f as Parameters<typeof webUtils.getPathForFile>[0]))
      .filter(Boolean),
  ready: () => ipcRenderer.send(IPC.ready),
  log: (message) => ipcRenderer.send(IPC.log, String(message).slice(0, 500)),
  getCursor: () => ipcRenderer.invoke(IPC.getCursor),
  onActivity: (cb) => listen<[Activity]>(IPC.activity, cb),
  setInteractive: (on) => ipcRenderer.send(IPC.setInteractive, on),
  setExpanded: (on, focus) => ipcRenderer.send(IPC.setExpanded, on, focus),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings) as Promise<Settings>,
  updateSettings: (patch) => ipcRenderer.invoke(IPC.updateSettings, patch),
  getAppInfo: () => ipcRenderer.invoke(IPC.getAppInfo),
  setStartWithWindows: (on) => ipcRenderer.invoke(IPC.setStartWithWindows, on),
  suspendShortcut: (on) => ipcRenderer.send(IPC.suspendShortcut, on),
  openDataFolder: () => ipcRenderer.send(IPC.openDataFolder),
  quit: () => ipcRenderer.send(IPC.quit),
  onToggle: (cb) => listen(IPC.toggle, cb),
  onBlur: (cb) => listen(IPC.blur, cb),
  onSettings: (cb) => listen<[Settings]>(IPC.settings, cb)
}

contextBridge.exposeInMainWorld('pulse', api)
