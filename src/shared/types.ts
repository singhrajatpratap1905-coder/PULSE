import type { Activity } from './widget'

export interface Settings {
  /** Electron accelerator, e.g. "Control+Alt+Space". */
  shortcut: string
  hoverToOpen: boolean
  hoverDelayMs: number
  /** Set once the first installed launch has turned on start-with-Windows. */
  autostartInitialized: boolean
}

export interface AppInfo {
  version: string
  /** The shortcut actually registered (may be a fallback), or null if none could be. */
  activeShortcut: string | null
  startWithWindows: boolean
  /** Only an installed copy can start with Windows (not dev, not an unpacked build). */
  canStartWithWindows: boolean
}

export interface SettingsResult {
  ok: boolean
  error?: string
  settings: Settings
  info: AppInfo
}

/**
 * How the panel was opened; decides how it closes.
 * hover: a peek that closes when the pointer leaves.
 * shortcut / click: stays open until Esc, the shortcut again, or clicking elsewhere.
 */
export type OpenSource = 'hover' | 'shortcut' | 'click'

/** The bridge exposed to the renderer as `window.pulse`. */
export interface PulseApi {
  widgets: {
    call(widgetId: string, method: string, ...args: unknown[]): Promise<unknown>
    on(widgetId: string, event: string, cb: (payload: unknown) => void): () => void
    /**
     * Drag files out to other apps; resolves when dropped. `ref` is a path relative to the
     * widget's dataDir, or whatever its service's resolveDrag understands.
     */
    startDrag(widgetId: string, ref: string): Promise<void>
  }
  /**
   * Real disk paths of files dropped onto the page. Pass an array (Array.from(dataTransfer.files)),
   * never the FileList itself: a FileList crossing the context bridge crashes the renderer.
   */
  pathsForFiles(files: unknown[]): string[]
  /** Call once listeners are attached; main holds widget messages until then. */
  ready(): void
  /** Writes a line to Pulse's log file (for tracing problems that only happen on a user's PC). */
  log(message: string): void
  /** Cursor position relative to the Pulse window, in CSS pixels. */
  getCursor(): Promise<{ x: number; y: number }>
  onActivity(cb: (activity: Activity) => void): () => void
  /** true while the pointer is over the notch/panel, so clicks land on Pulse. */
  setInteractive(on: boolean): void
  /** Tell main the panel opened or closed; `focus` grabs the keyboard. */
  setExpanded(on: boolean, focus: boolean): void
  getSettings(): Promise<Settings>
  /** Applies a settings change; a shortcut another app owns is refused and the old one kept. */
  updateSettings(patch: Partial<Settings>): Promise<SettingsResult>
  getAppInfo(): Promise<AppInfo>
  setStartWithWindows(on: boolean): Promise<AppInfo>
  /** Pause the global shortcut while the user records a new one. */
  suspendShortcut(on: boolean): void
  openDataFolder(): void
  quit(): void
  onToggle(cb: () => void): () => void
  onBlur(cb: () => void): () => void
  onSettings(cb: (settings: Settings) => void): () => void
}
