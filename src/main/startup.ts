import { app, shell, type ShortcutDetails } from 'electron'
import { existsSync, rmSync } from 'fs'
import { dirname, join } from 'path'

/**
 * installed:  a copy installed on this PC: by `Install Pulse.cmd` (Electron's own signed exe plus
 *             the app, in %LOCALAPPDATA%\Programs\Pulse) or by an electron-builder installer.
 * source:     the production build run straight from the project by its own Electron.
 * dev:        `npm run dev`.
 * test-build: electron-builder's unpacked output, which must never register itself anywhere.
 */
export type LaunchMode = 'installed' | 'source' | 'dev' | 'test-build'

export const launchMode: LaunchMode = import.meta.env.DEV
  ? 'dev'
  : !app.isPackaged
    ? 'source'
    : /[\\/]win-unpacked[\\/]/i.test(process.execPath)
      ? 'test-build'
      : 'installed'

export const APP_USER_MODEL_ID = 'com.pulse.app'

export const canStartWithWindows = launchMode === 'installed' || launchMode === 'source'

const programsDir = (): string =>
  join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs')
const startupLink = (): string => join(programsDir(), 'Startup', 'Pulse.lnk')
const startMenuLink = (): string => join(programsDir(), 'Pulse.lnk')

/** How Windows should launch this copy of Pulse. */
function launchShortcut(): ShortcutDetails {
  if (launchMode === 'source') {
    // Electron's own exe pointed at the project folder.
    return {
      target: process.execPath,
      args: `"${app.getAppPath()}"`,
      cwd: app.getAppPath(),
      icon: join(app.getAppPath(), 'build', 'icon.ico'),
      iconIndex: 0,
      appUserModelId: APP_USER_MODEL_ID,
      description: 'Pulse'
    }
  }
  // Installed: the exe itself. Install Pulse.cmd puts Pulse's icon next to it, because the exe
  // keeps Electron's own icon (changing it would break the signature Windows trusts).
  const icon = join(dirname(process.execPath), 'pulse.ico')
  return {
    target: process.execPath,
    cwd: dirname(process.execPath),
    icon: existsSync(icon) ? icon : process.execPath,
    iconIndex: 0,
    appUserModelId: APP_USER_MODEL_ID,
    description: 'Pulse'
  }
}

export function getStartWithWindows(): boolean {
  if (launchMode === 'installed') return app.getLoginItemSettings().openAtLogin
  if (launchMode === 'source') return existsSync(startupLink())
  return false
}

export function setStartWithWindows(on: boolean): void {
  if (launchMode === 'installed') {
    app.setLoginItemSettings({ openAtLogin: on })
  } else if (launchMode === 'source') {
    if (on) shell.writeShortcutLink(startupLink(), 'replace', launchShortcut())
    else rmSync(startupLink(), { force: true })
  }
}

/**
 * Keeps a Start menu entry for this copy: it's how you launch Pulse again after quitting, and
 * Windows needs a shortcut carrying the app's id to show its notifications. Rewritten each
 * launch so it always points at the copy that's actually running.
 */
export function ensureStartMenuEntry(): void {
  if (!canStartWithWindows) return
  shell.writeShortcutLink(startMenuLink(), 'replace', launchShortcut())
  if (launchMode === 'source' && existsSync(startupLink())) {
    shell.writeShortcutLink(startupLink(), 'replace', launchShortcut())
  }
}
