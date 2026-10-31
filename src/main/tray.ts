import { app, Menu, Tray } from 'electron'
import type { AppInfo, Settings } from '@shared/types'
import { createTrayIcon } from './trayIcon'

interface TrayOptions {
  getSettings: () => Settings
  getInfo: () => AppInfo
  onToggle: () => void
  onSettings: (patch: Partial<Settings>) => void
  onStartWithWindows: (on: boolean) => void
}

export function createTray({
  getSettings,
  getInfo,
  onToggle,
  onSettings,
  onStartWithWindows
}: TrayOptions): {
  tray: Tray
  refresh: () => void
} {
  const tray = new Tray(createTrayIcon())
  tray.setToolTip('Pulse')
  tray.on('click', onToggle)

  const refresh = (): void => {
    const s = getSettings()
    const info = getInfo()
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open Pulse', accelerator: info.activeShortcut ?? undefined, click: onToggle },
        { type: 'separator' },
        {
          label: 'Open on hover',
          type: 'checkbox',
          checked: s.hoverToOpen,
          click: (item) => onSettings({ hoverToOpen: item.checked })
        },
        {
          label: 'Start with Windows',
          type: 'checkbox',
          enabled: info.canStartWithWindows,
          checked: info.startWithWindows,
          click: (item) => onStartWithWindows(item.checked)
        },
        { type: 'separator' },
        { label: 'Quit Pulse', click: () => app.quit() }
      ])
    )
  }

  refresh()
  return { tray, refresh }
}
