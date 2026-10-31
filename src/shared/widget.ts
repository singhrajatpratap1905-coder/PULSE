// The contract every widget folder implements. A widget lives in src/widgets/<id>/ with:
//   manifest.ts  identity and dock order (required)
//   ui.tsx       Page and optional Home Card (required)
//   service.ts   background logic in the main process (optional)

export interface WidgetManifest {
  /** Must match the folder name. */
  id: string
  name: string
  /** Dock position; lower comes first. */
  order: number
  /** Only loaded in development builds. */
  devOnly?: boolean
  /**
   * Files dropped on the notch go to this widget's `dropFiles(paths)` handler and open its page.
   * The first widget (by order) that sets it wins.
   */
  acceptsFiles?: boolean
  /** A background-only widget: no dock icon, no Home card, no ui.tsx needed. */
  hidden?: boolean
}

export type ActivityTone = 'neutral' | 'success' | 'warning' | 'danger'

/** A short message the notch shows while collapsed. */
export interface ActivityInput {
  title: string
  detail?: string
  tone?: ActivityTone
  durationMs?: number
  /** Activities with the same key replace each other instead of queueing (e.g. repeated copies). */
  key?: string
  /** Wait for the panel to close instead of being dropped while it's open (e.g. a timer finishing). */
  important?: boolean
  /**
   * Show Boo, the ghost mascot, acting out this scene instead of the plain message. Shown only
   * if the user has the mascot and this `moment` turned on; otherwise the plain message appears.
   */
  scene?: MascotScene
  moment?: MascotMoment
}

export type MascotScene = 'wave' | 'typing' | 'coffee' | 'celebrate' | 'sleepy'
export type MascotMoment = 'greetings' | 'focus' | 'celebrations' | 'bedtime'

export interface MascotPrefs {
  enabled: boolean
  name: string
  moments: Record<MascotMoment, boolean>
}

export interface NotificationInput {
  title: string
  body?: string
}

export interface Activity extends ActivityInput {
  id: string
  widgetId: string
}

/** Persistent key/value storage, namespaced per widget. */
export interface WidgetStore {
  get<T>(key: string, fallback: T): T
  set<T>(key: string, value: T): void
  delete(key: string): void
}

export interface WidgetContext {
  id: string
  store: WidgetStore
  /** A folder of this widget's own (%APPDATA%\Pulse\widgets\<id>), created on first use. */
  dataDir(): string
  /** URL the UI can load a file under dataDir from, e.g. in an <img>. */
  assetUrl(relPath: string): string
  /** Push an event to this widget's UI. */
  emit(event: string, payload?: unknown): void
  /** Show a message in the notch. */
  activity(input: ActivityInput): void
  /** Show a Windows notification, for things worth noticing even when the notch is hidden. */
  notify(input: NotificationInput): void
  /** Expose a method the UI can call with `widget.call(method, ...args)`. */
  handle(method: string, fn: (...args: any[]) => unknown): void
  /**
   * Lets the UI drag files that live outside dataDir (e.g. a shelf's references) out to other
   * apps. `ref` is whatever the UI passed to `fileDragProps`; return the absolute paths it means,
   * or null to refuse. Without a resolver, refs are paths relative to dataDir.
   */
  resolveDrag(fn: (ref: string) => string[] | null): void
}

/** Runs once at startup; may return a cleanup function. */
export type WidgetService = (ctx: WidgetContext) => void | (() => void)

/** Scheme for widget assets: pulse://<widgetId>/<relPath>. */
export const ASSET_SCHEME = 'pulse'

export const assetUrl = (widgetId: string, relPath: string): string =>
  `${ASSET_SCHEME}://${widgetId}/${relPath.split(/[\\/]/).map(encodeURIComponent).join('/')}`

export const defineManifest = (manifest: WidgetManifest): WidgetManifest => manifest
export const defineService = (service: WidgetService): WidgetService => service
