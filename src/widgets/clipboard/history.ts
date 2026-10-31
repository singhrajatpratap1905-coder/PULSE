import type {
  ClipDetail,
  ClipFilter,
  ClipItem,
  ClipKind,
  ClipPreview,
  ClipQuery,
  ClipQueryResult
} from './types'

/** Unpinned items kept; pinned items never count or expire. */
export const MAX_ITEMS = 500
/** Unpinned images kept, since each can be megabytes on disk. */
export const MAX_IMAGES = 100
/** Bigger copies (huge logs, dumps) are not recorded. */
export const MAX_TEXT_CHARS = 500_000

const PREVIEW_CHARS = 300
// Texts up to this length travel with list previews (see ClipPreview.text).
const INLINE_TEXT_CHARS = 5_000

const COLOR_RE = /^(#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgb|hsl)a?\(\s*[\d.%\s,/+-]+\))$/i
const URL_RE = /^(?:https?:\/\/|www\.)\S+$/i

export function classifyText(text: string): ClipKind {
  const t = text.trim()
  if (COLOR_RE.test(t)) return 'color'
  if (URL_RE.test(t)) return 'link'
  return 'text'
}

export type NewItem = Omit<ClipItem, 'id' | 'createdAt' | 'pinned'> & { id: string }

interface HistoryHooks {
  /** Called after every change with the full list to persist. */
  save: (items: ClipItem[]) => void
  /** Called for each item dropped by limits, so its files can be deleted. */
  evict: (item: ClipItem) => void
  assetUrl: (relPath: string) => string
}

/** Clipboard history, newest first. */
export class ClipHistory {
  constructor(
    private items: ClipItem[],
    private hooks: HistoryHooks
  ) {}

  find(id: string): ClipItem | undefined {
    return this.items.find((i) => i.id === id)
  }

  findByHash(hash: string): ClipItem | undefined {
    return this.items.find((i) => i.hash === hash)
  }

  /** Adds a new item at the top. Use findByHash/touch first to avoid duplicates. */
  add(item: NewItem): ClipItem {
    const full: ClipItem = { ...item, createdAt: Date.now(), pinned: false }
    this.items.unshift(full)
    this.enforceLimits()
    this.hooks.save(this.items)
    return full
  }

  /** Moves an existing item to the top, as if just copied. */
  touch(id: string): void {
    const index = this.items.findIndex((i) => i.id === id)
    if (index < 0) return
    const [item] = this.items.splice(index, 1)
    item.createdAt = Date.now()
    this.items.unshift(item)
    this.hooks.save(this.items)
  }

  setPinned(id: string, pinned: boolean): void {
    const item = this.find(id)
    if (!item || item.pinned === pinned) return
    item.pinned = pinned
    this.enforceLimits()
    this.hooks.save(this.items)
  }

  remove(id: string): void {
    const item = this.find(id)
    if (!item) return
    this.items = this.items.filter((i) => i !== item)
    this.hooks.evict(item)
    this.hooks.save(this.items)
  }

  /** Removes everything except pinned items. */
  clear(): void {
    for (const item of this.items) if (!item.pinned) this.hooks.evict(item)
    this.items = this.items.filter((i) => i.pinned)
    this.hooks.save(this.items)
  }

  query({ filter = 'all', search = '', limit }: ClipQuery): Omit<ClipQueryResult, 'paused'> {
    const counts: Record<ClipFilter, number> = { all: 0, text: 0, link: 0, color: 0, image: 0 }
    for (const item of this.items) {
      counts.all++
      counts[item.kind]++
    }

    const needle = search.trim().toLowerCase()
    const matches = this.items.filter(
      (i) =>
        (filter === 'all' || i.kind === filter) &&
        (!needle ||
          i.text?.toLowerCase().includes(needle) ||
          i.source?.toLowerCase().includes(needle))
    )
    const ordered = [...matches.filter((i) => i.pinned), ...matches.filter((i) => !i.pinned)]
    const items = (limit ? ordered.slice(0, limit) : ordered).map((i) => this.preview(i))
    return { items, counts }
  }

  detail(id: string): ClipDetail | null {
    const item = this.find(id)
    if (!item) return null
    return {
      ...this.preview(item),
      text: item.text,
      imageUrl: item.image && this.hooks.assetUrl(item.image.file)
    }
  }

  private preview(item: ClipItem): ClipPreview {
    const { id, kind, createdAt, pinned, source, text, image } = item
    const base = { id, kind, createdAt, pinned, source }
    if (image) {
      return {
        ...base,
        preview: 'Image',
        thumbUrl: this.hooks.assetUrl(image.thumb),
        thumbFile: image.thumb,
        imageFile: image.file,
        width: image.width,
        height: image.height,
        bytes: image.bytes
      }
    }
    const t = text ?? ''
    return {
      ...base,
      preview: t
        .slice(0, PREVIEW_CHARS * 2)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, PREVIEW_CHARS),
      text: t.length <= INLINE_TEXT_CHARS ? t : undefined,
      words: t.trim() ? t.trim().split(/\s+/).length : 0,
      chars: t.length
    }
  }

  private enforceLimits(): void {
    let unpinned = 0
    let images = 0
    const keep: ClipItem[] = []
    for (const item of this.items) {
      if (item.pinned) {
        keep.push(item)
        continue
      }
      unpinned++
      if (item.image) images++
      if (unpinned > MAX_ITEMS || (item.image && images > MAX_IMAGES)) this.hooks.evict(item)
      else keep.push(item)
    }
    this.items = keep
  }
}
