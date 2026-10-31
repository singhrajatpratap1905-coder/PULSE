import { shell } from 'electron'
import { randomUUID } from 'crypto'
import { defineService } from '@shared/widget'
import { ENGINES, hostOf, normalizeUrl, type Link } from './types'

const MAX_LINKS = 200

export default defineService((ctx) => {
  let links = ctx.store.get<Link[]>('links', [])

  const save = (next: Link[]): void => {
    links = next
    ctx.store.set('links', links)
    ctx.emit('changed')
  }

  const open = (url: string): void => {
    // Only ever hand web addresses to the browser.
    const safe = normalizeUrl(url)
    if (safe) shell.openExternal(safe)
  }

  ctx.handle('list', () =>
    [...links].sort((a, b) => b.opens - a.opens || b.createdAt - a.createdAt)
  )

  ctx.handle('add', (url: string, title?: string) => {
    const normalized = normalizeUrl(String(url))
    if (!normalized) throw new Error("That doesn't look like a web address")
    const existing = links.find((l) => l.url === normalized)
    if (existing) return existing.id
    const link: Link = {
      id: randomUUID(),
      url: normalized,
      title: String(title ?? '').trim().slice(0, 80) || hostOf(normalized),
      createdAt: Date.now(),
      opens: 0
    }
    save([link, ...links].slice(0, MAX_LINKS))
    return link.id
  })

  ctx.handle('update', (id: string, patch: { title?: string; url?: string }) => {
    const url = patch.url === undefined ? undefined : normalizeUrl(patch.url)
    if (patch.url !== undefined && !url) throw new Error("That doesn't look like a web address")
    save(
      links.map((l) =>
        l.id === id
          ? {
              ...l,
              url: url ?? l.url,
              title: patch.title === undefined ? l.title : patch.title.trim().slice(0, 80) || hostOf(url ?? l.url)
            }
          : l
      )
    )
  })

  ctx.handle('remove', (id: string) => save(links.filter((l) => l.id !== id)))

  ctx.handle('open', (id: string) => {
    const link = links.find((l) => l.id === id)
    if (!link) return
    open(link.url)
    save(links.map((l) => (l.id === id ? { ...l, opens: l.opens + 1 } : l)))
  })

  /** Opens a typed address directly, without saving it. */
  ctx.handle('openUrl', (url: string) => open(String(url)))

  ctx.handle('search', (engineId: string, query: string) => {
    const engine = ENGINES.find((e) => e.id === engineId) ?? ENGINES[0]
    const q = String(query).trim()
    if (q) open(engine.template.replace('{q}', encodeURIComponent(q)))
  })
})
