// A shelf holds references to files where they already are; nothing is copied.

export interface ShelfItem {
  id: string
  path: string
  name: string
  /** Bytes, or null for folders. */
  size: number | null
  isDir: boolean
  addedAt: number
}

export interface Shelf {
  id: string
  name: string
  items: ShelfItem[]
}

export interface ShelfItemView extends ShelfItem {
  /** The file was moved or deleted since it was shelved. */
  missing: boolean
  /** Thumbnail or file-type icon as a data URL, once Windows has produced it. */
  icon?: string
}

export interface ShelfView {
  id: string
  name: string
  items: ShelfItemView[]
  totalBytes: number
}

export interface ShelfState {
  shelves: ShelfView[]
  /** Where dropped files go, and the shelf the page shows. */
  activeId: string
}
