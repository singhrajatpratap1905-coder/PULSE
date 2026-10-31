import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { log } from './log'
import { WINDOW } from '@shared/layout'

/**
 * One transparent, always-on-top window pinned to the top-center of the primary display.
 * It is big enough for the expanded panel; the renderer draws the notch inside it and
 * the window ignores the mouse everywhere except where the renderer says it is interactive.
 */
export function createNotchWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: WINDOW.width,
    height: WINDOW.height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    show: false,
    title: 'Pulse',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  win.setIgnoreMouseEvents(true, { forward: true })
  positionAtTop(win)

  const reposition = (): void => positionAtTop(win)
  screen.on('display-added', reposition)
  screen.on('display-removed', reposition)
  screen.on('display-metrics-changed', reposition)
  win.on('closed', () => {
    screen.off('display-added', reposition)
    screen.off('display-removed', reposition)
    screen.off('display-metrics-changed', reposition)
  })

  const created = Date.now()
  win.once('ready-to-show', () => {
    log.info(`window ready after ${Date.now() - created} ms`)
    win.showInactive()
  })
  win.on('show', () => log.info('notch shown'))
  win.on('hide', () => log.info('notch hidden'))
  win.on('focus', () => log.info('window focused'))
  win.on('blur', () => log.info('window lost focus'))

  // The window only ever shows Pulse's own UI: a file dropped where nothing handles it must not
  // replace the page by opening that file, and nothing may open new windows.
  win.webContents.on('will-navigate', (e, url) => {
    e.preventDefault()
    console.warn('[pulse] blocked navigation to', url)
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  // The UI's warnings and errors go to the log (and the terminal, in development).
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level === 2) console.warn(`[renderer] ${message}`)
    if (level >= 3) console.error(`[renderer] ${message} (${sourceId}:${line})`)
  })
  win.webContents.on('did-fail-load', (_e, code, description, url) =>
    console.error(`[pulse] UI failed to load ${url}: ${description} (${code})`)
  )
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[pulse] renderer gone:', details.reason)
    win.webContents.reload()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

function positionAtTop(win: BrowserWindow): void {
  const { bounds } = screen.getPrimaryDisplay()
  win.setBounds({
    x: Math.round(bounds.x + (bounds.width - WINDOW.width) / 2),
    y: bounds.y,
    width: WINDOW.width,
    height: WINDOW.height
  })
}
