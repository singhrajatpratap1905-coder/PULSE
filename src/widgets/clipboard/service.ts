import { clipboard, nativeImage, shell } from 'electron'
import { createHash, randomUUID } from 'crypto'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { defineService } from '@shared/widget'
import { friendlyAppName } from '@main/platform/apps'
import { ClipHistory, classifyText, MAX_TEXT_CHARS } from './history'
import { KIND_LABEL, type ClipItem, type ClipQuery, type ClipQueryResult } from './types'
import { watchClipboard } from './watcher'

const THUMB_WIDTH = 480

// Password managers; most also mark their copies private, this catches the ones that don't.
const DEFAULT_BLOCKED_APPS = [
  '1password.exe',
  'bitwarden.exe',
  'dashlane.exe',
  'enpass.exe',
  'keepass.exe',
  'keepassxc.exe',
  'lastpass.exe',
  'nordpass.exe',
  'proton pass.exe',
  'roboform.exe'
]

const sha1 = (data: string | Buffer): string => createHash('sha1').update(data).digest('hex')

export default defineService((ctx) => {
  const deleteFiles = (item: ClipItem): void => {
    if (!item.image) return
    for (const rel of new Set([item.image.file, item.image.thumb])) {
      rmSync(join(ctx.dataDir(), rel), { force: true })
    }
  }

  const history = new ClipHistory(ctx.store.get<ClipItem[]>('items', []), {
    save: (items) => {
      ctx.store.set('items', items)
      ctx.emit('changed')
    },
    evict: deleteFiles,
    assetUrl: ctx.assetUrl
  })

  let paused = ctx.store.get('paused', false)
  const blocked = new Set(ctx.store.get('blockedApps', DEFAULT_BLOCKED_APPS).map((a) => a.toLowerCase()))

  const announce = (item: ClipItem): void => {
    ctx.activity({
      title: 'Copied',
      detail: item.image ? `Image · ${item.image.width} × ${item.image.height}` : KIND_LABEL[item.kind],
      key: 'copied',
      // With Boo in the notch, Boo catches it instead of the text message.
      scene: 'catch'
    })
  }

  const watcher = watchClipboard(
    (captured) => {
      const source = captured.sourceExe ? friendlyAppName(captured.sourceExe) : undefined

      if (captured.kind === 'text') {
        if (captured.text.length > MAX_TEXT_CHARS) return
        const hash = sha1(`text:${captured.text}`)
        const existing = history.findByHash(hash)
        if (existing) {
          history.touch(existing.id)
          return announce(existing)
        }
        const item = history.add({
          id: randomUUID(),
          kind: classifyText(captured.text),
          text: captured.text,
          hash,
          source
        })
        return announce(item)
      }

      const { image } = captured
      const hash = sha1(image.toBitmap())
      const existing = history.findByHash(hash)
      if (existing) {
        history.touch(existing.id)
        return announce(existing)
      }

      const id = randomUUID()
      const { width, height } = image.getSize()
      const png = image.toPNG()
      mkdirSync(join(ctx.dataDir(), 'images'), { recursive: true })
      const file = `images/${id}.png`
      writeFileSync(join(ctx.dataDir(), file), png)
      let thumb = file
      if (width > THUMB_WIDTH) {
        thumb = `images/${id}.thumb.png`
        writeFileSync(
          join(ctx.dataDir(), thumb),
          image.resize({ width: THUMB_WIDTH, quality: 'good' }).toPNG()
        )
      }
      const item = history.add({
        id,
        kind: 'image',
        hash,
        source,
        image: { file, thumb, width, height, bytes: png.length }
      })
      announce(item)
    },
    { isPaused: () => paused, isBlocked: (exe) => blocked.has(exe) }
  )

  ctx.handle('query', (q: ClipQuery = {}): ClipQueryResult => ({ ...history.query(q), paused }))
  ctx.handle('get', (id: string) => history.detail(id))

  ctx.handle('copy', (id: string) => {
    const item = history.find(id)
    if (!item) return false
    if (item.image) {
      clipboard.writeImage(nativeImage.createFromPath(join(ctx.dataDir(), item.image.file)))
    } else {
      clipboard.writeText(item.text ?? '')
    }
    watcher.markSelfWrite()
    history.touch(id)
    return true
  })

  ctx.handle('setPinned', (id: string, pinned: boolean) => history.setPinned(id, pinned))
  ctx.handle('remove', (id: string) => history.remove(id))
  ctx.handle('clear', () => history.clear())

  ctx.handle('getBlockedApps', () => [...blocked].sort())

  ctx.handle('setBlockedApps', (apps: unknown[]) => {
    const clean = apps
      .map((a) => String(a).trim().toLowerCase())
      .map((a) => (a && !a.endsWith('.exe') ? `${a}.exe` : a))
      .filter((a) => /^[^\\/:*?"<>|]+\.exe$/.test(a))
    blocked.clear()
    for (const a of clean) blocked.add(a)
    ctx.store.set('blockedApps', [...blocked])
    return [...blocked].sort()
  })

  ctx.handle('setPaused', (next: boolean) => {
    paused = next
    ctx.store.set('paused', paused)
    ctx.emit('changed')
  })

  ctx.handle('openLink', (id: string) => {
    const item = history.find(id)
    if (item?.kind !== 'link' || !item.text) return
    const raw = item.text.trim()
    const url = new URL(/^www\./i.test(raw) ? `https://${raw}` : raw)
    if (url.protocol === 'http:' || url.protocol === 'https:') shell.openExternal(url.toString())
  })

  return () => watcher.stop()
})
