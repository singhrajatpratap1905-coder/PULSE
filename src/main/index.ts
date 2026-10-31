import { app, globalShortcut, ipcMain, screen, shell, type BrowserWindow } from 'electron'
import { join } from 'path'
import { IPC } from '@shared/ipc'
import type { AppInfo, Settings, SettingsResult } from '@shared/types'
import { createNotchWindow } from './notchWindow'
import { watchFullscreen } from './fullscreen'
import { getSettings, updateSettings } from './settings'
import { createTray } from './tray'
import { registerAssetScheme, startWidgets } from './widgets/host'
import {
  APP_USER_MODEL_ID,
  canStartWithWindows,
  ensureStartMenuEntry,
  getStartWithWindows,
  launchMode,
  setStartWithWindows as applyStartWithWindows
} from './startup'
import { installLogging, log } from './log'
import { pulseVersion } from './version'

app.setName('Pulse')
app.setAppUserModelId(APP_USER_MODEL_ID)
// Development keeps its own data, so experiments never touch your real history and notes, and
// `npm run dev` can run alongside the everyday copy.
if (import.meta.env.DEV) app.setPath('userData', join(app.getPath('appData'), 'Pulse Dev'))
registerAssetScheme()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  installLogging()
  log.info(`Pulse ${pulseVersion()} starting (${launchMode}, Electron ${process.versions.electron})`)
  let win: BrowserWindow
  let expanded = false
  let fullscreen = false
  let stopWidgets = (): void => {}
  let refreshTray = (): void => {}

  const toggle = (): void => {
    if (!win.isVisible()) win.showInactive()
    win.webContents.send(IPC.toggle)
  }

  // Tried in order when the saved shortcut is already owned by another app at startup.
  const FALLBACK_SHORTCUTS = ['Alt+`', 'Control+Alt+P']
  let activeShortcut: string | null = null

  // Malformed accelerators throw instead of returning false.
  const tryRegister = (accelerator: string): boolean => {
    try {
      return globalShortcut.register(accelerator, toggle)
    } catch {
      return false
    }
  }

  const registerShortcut = (preferred: string): void => {
    globalShortcut.unregisterAll()
    activeShortcut = null
    for (const accelerator of [preferred, ...FALLBACK_SHORTCUTS]) {
      if (tryRegister(accelerator)) {
        activeShortcut = accelerator
        if (accelerator !== preferred) {
          console.warn(`[pulse] ${preferred} is taken by another app; using ${accelerator}`)
        }
        return
      }
    }
    console.warn('[pulse] no global shortcut available; open Pulse from the tray or by hovering')
  }

  const appInfo = (): AppInfo => ({
    version: pulseVersion(),
    activeShortcut,
    startWithWindows: getStartWithWindows(),
    canStartWithWindows
  })

  const broadcast = (): void => {
    win.webContents.send(IPC.settings, getSettings())
    refreshTray()
  }

  const applySettings = (patch: Partial<Settings>): SettingsResult => {
    let error: string | undefined
    if (patch.shortcut !== undefined && patch.shortcut !== activeShortcut) {
      globalShortcut.unregisterAll()
      if (tryRegister(patch.shortcut)) {
        activeShortcut = patch.shortcut
      } else {
        error = `${patch.shortcut.replace(/\+/g, ' + ')} is already used by another app`
        registerShortcut(getSettings().shortcut)
        delete patch.shortcut
      }
    }
    updateSettings(patch)
    broadcast()
    return { ok: !error, error, settings: getSettings(), info: appInfo() }
  }

  const setStartWithWindows = (on: boolean): AppInfo => {
    applyStartWithWindows(on)
    refreshTray()
    return appInfo()
  }

  // The notch stays hidden behind fullscreen apps, unless the panel is open.
  const syncVisibility = (): void => {
    if (fullscreen && !expanded) win.hide()
    else if (!win.isVisible()) win.showInactive()
  }

  // Launching Pulse again (Start menu, desktop shortcut) opens the panel of the running copy.
  // `--replace` (from `npm run local`) instead restarts it, so a fresh build takes over.
  app.on('second-instance', (_e, argv) => {
    if (argv.includes('--replace')) {
      log.info('restarting on a new build (--replace)')
      app.relaunch()
      app.quit()
      return
    }
    if (win && !expanded) toggle()
  })

  app.whenReady().then(() => {
    win = createNotchWindow()

    ensureStartMenuEntry()
    // A tray utility is expected to start with Windows: turn it on once, on the first real run,
    // and whenever the installer asks (it replaces whatever started Pulse before).
    const installerAsked = process.argv.includes('--enable-autostart')
    if (canStartWithWindows && (installerAsked || !getSettings().autostartInitialized)) {
      applyStartWithWindows(true)
      updateSettings({ autostartInitialized: true })
      log.info('start with Windows turned on')
    }

    ipcMain.on(IPC.setInteractive, (_e, on: boolean) => {
      win.setIgnoreMouseEvents(!on, { forward: true })
    })

    ipcMain.on(IPC.setExpanded, (_e, on: boolean, focus: boolean) => {
      expanded = on
      if (on && focus) win.focus()
      if (!on && win.isFocused()) win.blur()
      syncVisibility()
    })

    ipcMain.handle(IPC.getSettings, () => getSettings())
    ipcMain.handle(IPC.updateSettings, (_e, patch: Partial<Settings>) => applySettings({ ...patch }))
    ipcMain.handle(IPC.getAppInfo, () => appInfo())
    ipcMain.handle(IPC.setStartWithWindows, (_e, on: boolean) => setStartWithWindows(!!on))
    ipcMain.on(IPC.suspendShortcut, (_e, on: boolean) => {
      if (on) globalShortcut.unregisterAll()
      else registerShortcut(getSettings().shortcut)
    })
    ipcMain.on(IPC.openDataFolder, () => shell.openPath(app.getPath('userData')))
    ipcMain.on(IPC.quit, () => app.quit())
    ipcMain.on(IPC.log, (_e, message: string) => log.info(`[ui] ${message}`))

    ipcMain.handle(IPC.getCursor, () => {
      const cursor = screen.getCursorScreenPoint()
      const bounds = win.getContentBounds()
      return { x: cursor.x - bounds.x, y: cursor.y - bounds.y }
    })

    win.on('blur', () => win.webContents.send(IPC.blur))

    stopWidgets = startWidgets(win)

    registerShortcut(getSettings().shortcut)

    refreshTray = createTray({
      getSettings,
      getInfo: appInfo,
      onToggle: toggle,
      onSettings: applySettings,
      onStartWithWindows: setStartWithWindows
    }).refresh

    watchFullscreen(win.getNativeWindowHandle(), (isFullscreen, reason) => {
      log.info(`fullscreen ${isFullscreen ? 'on' : 'off'}: ${reason}`)
      fullscreen = isFullscreen
      syncVisibility()
    })
  })

  // Pulse lives in the tray; it only quits from the tray menu or Settings.
  app.on('window-all-closed', () => {})
  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    stopWidgets()
  })
}
