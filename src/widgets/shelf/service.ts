import { app, dialog, nativeImage, shell } from 'electron'
import { randomUUID } from 'crypto'
import { existsSync, statSync } from 'fs'
import { basename, isAbsolute } from 'path'
import { defineService } from '@shared/widget'
import type { Shelf, ShelfItem, ShelfState } from './types'

const MAX_ITEMS_PER_SHELF = 200
const MAX_SHELVES = 12
const ICON_SIZE = 96

export default defineService((ctx) => {
  let shelves = ctx.store.get<Shelf[]>('shelves', [])
  if (!shelves.length) shelves = [{ id: randomUUID(), name: 'Desk', items: [] }]
  let activeId = ctx.store.get('activeId', shelves[0].id)
  if (!shelves.some((s) => s.id === activeId)) activeId = shelves[0].id

  // Thumbnails live in memory only; Windows regenerates them quickly after a restart.
  const icons = new Map<string, string>()
  const loading = new Set<string>()
  let emitTimer: NodeJS.Timeout | undefined

  const view = (): ShelfState => ({
    activeId,
    shelves: shelves.map((s) => ({
      id: s.id,
      name: s.name,
      totalBytes: s.items.reduce((sum, i) => sum + (i.size ?? 0), 0),
      items: s.items.map((item) => {
        const missing = !existsSync(item.path)
        // Windows' folder thumbnails are inconsistent; the UI draws its own folder icon.
        if (!missing && !item.isDir) loadIcon(item.path)
        return { ...item, missing, icon: icons.get(item.path) }
      })
    }))
  })

  // Icons arrive one by one; batch the resulting updates.
  const emitSoon = (): void => {
    clearTimeout(emitTimer)
    emitTimer = setTimeout(() => ctx.emit('state', view()), 60)
  }

  const loadIcon = (path: string): void => {
    if (icons.has(path) || loading.has(path)) return
    loading.add(path)
    nativeImage
      .createThumbnailFromPath(path, { width: ICON_SIZE, height: ICON_SIZE })
      .catch(() => app.getFileIcon(path, { size: 'large' }))
      .then((img) => {
        if (!img.isEmpty()) icons.set(path, img.toDataURL())
        emitSoon()
      })
      .catch(() => {})
      .finally(() => loading.delete(path))
  }

  const save = (): void => {
    ctx.store.set('shelves', shelves)
    ctx.store.set('activeId', activeId)
    emitSoon()
  }

  const shelfById = (id: string): Shelf => {
    const shelf = shelves.find((s) => s.id === id)
    if (!shelf) throw new Error('That shelf no longer exists')
    return shelf
  }

  const findItem = (itemId: string): ShelfItem | undefined =>
    shelves.flatMap((s) => s.items).find((i) => i.id === itemId)

  /** Adds existing files and folders to a shelf; returns how many were new. */
  const add = (shelfId: string, paths: unknown[]): number => {
    const shelf = shelfById(shelfId)
    const known = new Set(shelf.items.map((i) => i.path.toLowerCase()))
    const added: ShelfItem[] = []
    for (const raw of paths) {
      const path = String(raw)
      if (!isAbsolute(path) || known.has(path.toLowerCase())) continue
      try {
        const st = statSync(path)
        added.push({
          id: randomUUID(),
          path,
          name: basename(path),
          size: st.isDirectory() ? null : st.size,
          isDir: st.isDirectory(),
          addedAt: Date.now()
        })
        known.add(path.toLowerCase())
      } catch {
        // Vanished between drop and stat; skip it.
      }
    }
    if (!added.length) return 0
    // A new batch goes in front, in the order it was dropped.
    shelf.items = [...added, ...shelf.items].slice(0, MAX_ITEMS_PER_SHELF)
    save()
    return added.length
  }

  const announce = (count: number, shelfId: string): void => {
    if (!count) return
    ctx.activity({
      title: 'Parked',
      detail: `${count} ${count === 1 ? 'item' : 'items'} on ${shelfById(shelfId).name}`,
      key: 'shelf-add'
    })
  }

  ctx.handle('getState', view)

  ctx.handle('add', (shelfId: string, paths: unknown[]) => add(shelfId, paths))

  /** Files dropped on the notch go to the active shelf. */
  ctx.handle('dropFiles', (paths: unknown[]) => {
    const count = add(activeId, paths)
    announce(count, activeId)
    return count
  })

  ctx.handle('pickFiles', async (shelfId: string) => {
    const result = await dialog.showOpenDialog({
      title: `Add to ${shelfById(shelfId).name}`,
      properties: ['openFile', 'multiSelections']
    })
    if (result.canceled) return 0
    const count = add(shelfId, result.filePaths)
    announce(count, shelfId)
    return count
  })

  ctx.handle('remove', (shelfId: string, itemIds: string[]) => {
    const shelf = shelfById(shelfId)
    const ids = new Set(itemIds)
    shelf.items = shelf.items.filter((i) => !ids.has(i.id))
    save()
  })

  ctx.handle('clear', (shelfId: string) => {
    shelfById(shelfId).items = []
    save()
  })

  ctx.handle('setActive', (shelfId: string) => {
    activeId = shelfById(shelfId).id
    save()
  })

  ctx.handle('createShelf', (name: string) => {
    if (shelves.length >= MAX_SHELVES) throw new Error(`Up to ${MAX_SHELVES} shelves`)
    const shelf: Shelf = { id: randomUUID(), name: String(name).trim().slice(0, 40) || 'Shelf', items: [] }
    shelves = [...shelves, shelf]
    activeId = shelf.id
    save()
    return shelf.id
  })

  ctx.handle('renameShelf', (shelfId: string, name: string) => {
    const trimmed = String(name).trim().slice(0, 40)
    if (trimmed) shelfById(shelfId).name = trimmed
    save()
  })

  ctx.handle('deleteShelf', (shelfId: string) => {
    if (shelves.length === 1) throw new Error('Keep at least one shelf')
    shelves = shelves.filter((s) => s.id !== shelfId)
    if (activeId === shelfId) activeId = shelves[0].id
    save()
  })

  ctx.handle('open', async (itemId: string) => {
    const item = findItem(itemId)
    if (item && existsSync(item.path)) await shell.openPath(item.path)
  })

  ctx.handle('reveal', (itemId: string) => {
    const item = findItem(itemId)
    if (item && existsSync(item.path)) shell.showItemInFolder(item.path)
  })

  // Only files actually on a shelf can be dragged out: the UI passes item ids, never paths.
  ctx.resolveDrag((ref) =>
    ref
      .split(',')
      .map((id) => findItem(id)?.path)
      .filter((p): p is string => !!p)
  )

  return () => clearTimeout(emitTimer)
})
