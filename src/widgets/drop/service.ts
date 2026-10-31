import { app, dialog, shell } from 'electron'
import { randomUUID } from 'crypto'
import { existsSync, statSync } from 'fs'
import { basename, isAbsolute, join } from 'path'
import QRCode from 'qrcode'
import { defineService } from '@shared/widget'
import { lanAddress, startDropServer, type DropServer, type ServedFile } from './server'
import type { DropState, ReceivedFile } from './types'

const SESSION_MS = 10 * 60_000
const MAX_FILES = 50
const KEEP_RECEIVED = 30

export default defineService((ctx) => {
  let received = ctx.store.get<ReceivedFile[]>('received', [])
  let files: ServedFile[] = []
  let server: DropServer | null = null
  let session: DropState['session'] = null
  let expiryTimer: NodeJS.Timeout | undefined
  let error: string | null = null

  const receiveDir = (): string => join(app.getPath('downloads'), 'Pulse Drop')

  const state = (): DropState => ({
    session: session && { ...session, files: files.map(({ id, name, size }) => ({ id, name, size })) },
    received,
    error
  })
  const emit = (): void => ctx.emit('state', state())

  const toServed = (paths: unknown[]): ServedFile[] => {
    const known = new Set(files.map((f) => f.path.toLowerCase()))
    const out: ServedFile[] = []
    for (const raw of paths) {
      const path = String(raw)
      if (!isAbsolute(path) || known.has(path.toLowerCase())) continue
      try {
        const st = statSync(path)
        // Folders can't be downloaded as one file; skip them.
        if (!st.isFile()) continue
        out.push({ id: randomUUID().slice(0, 8), name: basename(path), path, size: st.size })
        known.add(path.toLowerCase())
      } catch {
        // Gone already; skip.
      }
    }
    return out
  }

  const stop = (): void => {
    clearTimeout(expiryTimer)
    server?.close()
    server = null
    session = null
    files = []
    emit()
  }

  // Calls that arrive while a server is still starting wait for it instead of starting another.
  let starting: Promise<DropState> | null = null
  const start = async (paths: unknown[] = []): Promise<DropState> => {
    if (starting) await starting
    starting = startNow(paths)
    try {
      return await starting
    } finally {
      starting = null
    }
  }

  /** Opens a session (or adds to the open one). Paths may be empty to only receive. */
  const startNow = async (paths: unknown[]): Promise<DropState> => {
    files = [...files, ...toServed(paths)].slice(0, MAX_FILES)
    if (server) {
      emit()
      return state()
    }

    // Development can serve on this PC only, without a network or a firewall prompt.
    const host = (import.meta.env.DEV && process.env.PULSE_DROP_HOST) || lanAddress()
    if (!host) {
      files = []
      error = 'Connect this PC to Wi-Fi or Ethernet first. Your phone needs to be on the same network.'
      emit()
      return state()
    }

    try {
      server = await startDropServer({
        host,
        files: () => files,
        receiveDir: receiveDir(),
        onDownload: (file) => {
          if (session) session.downloads++
          ctx.activity({ title: 'Sent to phone', detail: file.name, tone: 'success', key: 'drop-sent' })
          emit()
        },
        onReceive: ({ name, path, size }) => {
          received = [{ id: randomUUID(), name, path, size, receivedAt: Date.now() }, ...received].slice(0, KEEP_RECEIVED)
          ctx.store.set('received', received)
          ctx.activity({ title: 'Received', detail: name, tone: 'success', important: true, key: 'drop-received' })
          emit()
        }
      })
    } catch (err) {
      files = []
      error = `Couldn't start sharing: ${(err as Error).message}`
      emit()
      return state()
    }

    error = null
    const qrSvg = await QRCode.toString(server.url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
    session = {
      url: server.url,
      qr: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}`,
      expiresAt: Date.now() + SESSION_MS,
      files: [],
      downloads: 0
    }
    expiryTimer = setTimeout(stop, SESSION_MS)
    emit()
    return state()
  }

  ctx.handle('getState', state)
  ctx.handle('start', (paths: unknown[]) => start(Array.isArray(paths) ? paths : []))
  ctx.handle('dropFiles', (paths: unknown[]) => start(Array.isArray(paths) ? paths : []))
  ctx.handle('stop', stop)

  ctx.handle('pickFiles', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Send to your phone',
      properties: ['openFile', 'multiSelections']
    })
    return result.canceled ? state() : start(result.filePaths)
  })

  ctx.handle('removeFile', (id: string) => {
    files = files.filter((f) => f.id !== id)
    emit()
  })

  ctx.handle('reveal', (id: string) => {
    const file = received.find((f) => f.id === id)
    if (file && existsSync(file.path)) shell.showItemInFolder(file.path)
  })

  ctx.handle('openReceived', () => shell.openPath(receiveDir()))

  ctx.handle('clearReceived', () => {
    received = []
    ctx.store.set('received', received)
    emit()
  })

  return () => {
    clearTimeout(expiryTimer)
    server?.close()
  }
})
