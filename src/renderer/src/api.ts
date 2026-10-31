import type { AppInfo, PulseApi, Settings } from '@shared/types'

const noop = (): void => {}

const SETTINGS: Settings = {
  shortcut: 'Control+Alt+Space',
  hoverToOpen: true,
  hoverDelayMs: 200,
  autostartInitialized: false
}

const INFO: AppInfo = {
  version: 'dev',
  activeShortcut: SETTINGS.shortcut,
  startWithWindows: false,
  canStartWithWindows: false
}

// Lets the UI run in a plain browser tab (no Electron) for quick visual work.
const browserFallback: PulseApi = {
  widgets: {
    call: async () => undefined,
    on: () => noop,
    startDrag: async () => {}
  },
  pathsForFiles: () => [],
  ready: noop,
  log: noop,
  getCursor: async () => ({ x: -1, y: -1 }),
  onActivity: () => noop,
  setInteractive: noop,
  setExpanded: noop,
  getSettings: async () => SETTINGS,
  updateSettings: async (patch) => ({ ok: true, settings: { ...SETTINGS, ...patch }, info: INFO }),
  getAppInfo: async () => INFO,
  setStartWithWindows: async () => INFO,
  suspendShortcut: noop,
  openDataFolder: noop,
  quit: noop,
  onToggle: () => noop,
  onBlur: () => noop,
  onSettings: () => noop
}

export const api: PulseApi = window.pulse ?? browserFallback
