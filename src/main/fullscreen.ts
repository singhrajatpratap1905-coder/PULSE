import { screen } from 'electron'
import { basename } from 'path'
import koffi from 'koffi'
import { processPathOfWindow, win32, windowClassName } from './platform/win32'

// Classes that cover the whole monitor but are not "fullscreen apps".
const IGNORED_CLASSES = new Set(['Progman', 'WorkerW', 'Shell_TrayWnd'])

// SHQueryUserNotificationState: 3 = exclusive Direct3D fullscreen (games).
const QUNS_RUNNING_D3D_FULL_SCREEN = 3

/**
 * Polls whether a fullscreen app (video, game, slideshow) owns the primary display.
 * `ownHandle` is Pulse's own window, which is never counted. `onChange` gets a short
 * description of what was detected, for the log.
 */
export function watchFullscreen(
  ownHandle: Buffer,
  onChange: (fullscreen: boolean, reason: string) => void,
  intervalMs = 1000
): () => void {
  const w = win32()
  if (!w) return () => {}

  const own = ownHandle.readBigUInt64LE(0)
  let last = false

  /** A reason string when something is fullscreen, else null. */
  const check = (): string | null => {
    const state = [0]
    if (w.SHQueryUserNotificationState(state) === 0 && state[0] === QUNS_RUNNING_D3D_FULL_SCREEN) {
      return 'Windows reports a fullscreen Direct3D app (game)'
    }

    const hwnd = w.GetForegroundWindow()
    if (!hwnd || koffi.address(hwnd) === own) return null
    const cls = windowClassName(hwnd)
    if (IGNORED_CLASSES.has(cls)) return null

    const rect = { left: 0, top: 0, right: 0, bottom: 0 }
    if (!w.GetWindowRect(hwnd, rect)) return null

    // Exact match only: maximized windows overhang the monitor by a few pixels instead.
    const mon = screen.dipToScreenRect(null, screen.getPrimaryDisplay().bounds)
    const covers =
      rect.left === mon.x &&
      rect.top === mon.y &&
      rect.right === mon.x + mon.width &&
      rect.bottom === mon.y + mon.height
    if (!covers) return null
    const exe = processPathOfWindow(hwnd)
    return `${exe ? basename(exe) : 'unknown app'} (window class ${cls}) covers the screen ${rect.left},${rect.top},${rect.right},${rect.bottom}`
  }

  const timer = setInterval(() => {
    const reason = check()
    const now = reason !== null
    if (now !== last) {
      last = now
      onChange(now, reason ?? 'no fullscreen app in front')
    }
  }, intervalMs)

  return () => clearInterval(timer)
}
