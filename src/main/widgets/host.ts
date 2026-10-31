import { app, ipcMain, nativeImage, net, Notification, protocol, type BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { isAbsolute, relative, resolve } from 'path'
import { pathToFileURL } from 'url'
import { IPC } from '@shared/ipc'
import {
  ASSET_SCHEME,
  assetUrl,
  type Activity,
  type WidgetContext,
  type WidgetManifest,
  type WidgetService
} from '@shared/widget'
import { flushStores, openStore, widgetDataDir } from './store'
import { log } from '../log'

// Found at build time: every src/widgets/<id>/manifest.ts and service.ts.
const manifests = import.meta.glob<WidgetManifest>('../../widgets/*/manifest.ts', {
  eager: true,
  import: 'default'
})
const services = import.meta.glob<WidgetService>('../../widgets/*/service.ts', {
  eager: true,
  import: 'default'
})

const folderOf = (path: string): string => path.split('/').at(-2)!

const WIDGET_IDS = new Set(Object.values(manifests).map((m) => m.id))

/** A path inside the widget's dataDir, or null if it escapes it or the widget is unknown. */
function resolveAsset(widgetId: string, relPath: string): string | null {
  if (!WIDGET_IDS.has(widgetId)) return null
  const base = widgetDataDir(widgetId)
  const file = resolve(base, relPath)
  const rel = relative(base, file)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null
  return file
}

/** Must run before app 'ready'. */
export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }
  ])
}

/** Starts every widget's background service and routes UI calls to their handlers. */
export function startWidgets(win: BrowserWindow): () => void {
  const handlers = new Map<string, (...args: any[]) => unknown>()
  const cleanups: Array<() => void> = []

  // Messages sent before the UI attached its listeners would be lost, so hold them.
  let rendererReady = false
  let held: Array<[string, unknown[]]> = []

  const send = (channel: string, ...args: unknown[]): void => {
    if (win.isDestroyed()) return
    if (!rendererReady) {
      held.push([channel, args])
      return
    }
    win.webContents.send(channel, ...args)
  }

  win.webContents.on('did-start-loading', () => (rendererReady = false))

  // Important activities raised while the notch is hidden (fullscreen app) show once it's back.
  let whileHidden: Activity[] = []
  win.on('show', () => {
    const pending = whileHidden
    whileHidden = []
    if (pending.length) log.info(`notch back: delivering ${pending.length} held message(s)`)
    for (const activity of pending) send(IPC.activity, activity)
  })
  ipcMain.on(IPC.ready, () => {
    log.info(`UI ready${held.length ? `: delivering ${held.length} queued message(s)` : ''}`)
    rendererReady = true
    const pending = held
    held = []
    for (const [channel, args] of pending) send(channel, ...args)
  })

  protocol.handle(ASSET_SCHEME, (req) => {
    const url = new URL(req.url)
    const file = resolveAsset(url.hostname, decodeURIComponent(url.pathname.slice(1)))
    if (!file || !existsSync(file)) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })

  const dragResolvers = new Map<string, (ref: string) => string[] | null>()

  ipcMain.handle(IPC.widgetDrag, async (e, widgetId: string, ref: string) => {
    const resolver = dragResolvers.get(widgetId)
    const candidates = resolver ? (resolver(String(ref)) ?? []) : [resolveAsset(widgetId, String(ref))]
    const files = candidates.filter((f): f is string => !!f && existsSync(f))
    if (!files.length) return
    let icon = nativeImage.createFromPath(files[0])
    icon = icon.isEmpty() ? await app.getFileIcon(files[0], { size: 'normal' }) : icon.resize({ width: 64 })
    e.sender.startDrag({ file: files[0], files, icon })
  })

  for (const [path, manifest] of Object.entries(manifests)) {
    const folder = folderOf(path)
    if (manifest.id !== folder) {
      console.warn(`[pulse] widget folder "${folder}" declares id "${manifest.id}"; skipping`)
      continue
    }
    if (manifest.devOnly && !import.meta.env.DEV) continue

    const service = services[path.replace(/manifest\.ts$/, 'service.ts')]
    if (!service) continue

    const id = manifest.id
    const ctx: WidgetContext = {
      id,
      store: openStore(id),
      dataDir: () => widgetDataDir(id),
      assetUrl: (relPath) => assetUrl(id, relPath),
      emit: (event, payload) => send(IPC.widgetEvent, id, event, payload),
      activity: (input) => {
        const activity: Activity = { ...input, id: randomUUID(), widgetId: id }
        // Nobody can see the notch while a fullscreen app has hidden it: routine messages
        // are dropped, important ones wait.
        // Mascot scenes are rare and the thing most worth tracing when one doesn't appear.
        if (activity.scene) {
          log.info(`scene "${activity.scene}" from ${id}: ${activity.title} (notch ${win.isVisible() ? 'visible' : 'hidden'})`)
        }
        if (!win.isVisible()) {
          if (activity.important) whileHidden = [...whileHidden, activity].slice(-4)
          return
        }
        send(IPC.activity, activity)
      },
      notify: ({ title, body }) => {
        if (Notification.isSupported()) new Notification({ title, body: body ?? '' }).show()
      },
      handle: (method, fn) => handlers.set(`${id}:${method}`, fn),
      resolveDrag: (fn) => dragResolvers.set(id, fn)
    }

    try {
      const cleanup = service(ctx)
      if (cleanup) cleanups.push(cleanup)
    } catch (err) {
      console.error(`[pulse] widget "${id}" failed to start:`, err)
    }
  }

  ipcMain.handle(IPC.widgetCall, (_e, id: string, method: string, args: unknown[]) => {
    const fn = handlers.get(`${id}:${method}`)
    if (!fn) throw new Error(`Widget "${id}" has no method "${method}"`)
    return fn(...args)
  })

  return () => {
    for (const cleanup of cleanups) cleanup()
    ipcMain.removeHandler(IPC.widgetCall)
    ipcMain.removeHandler(IPC.widgetDrag)
    ipcMain.removeAllListeners(IPC.ready)
    protocol.unhandle(ASSET_SCHEME)
    flushStores()
  }
}
