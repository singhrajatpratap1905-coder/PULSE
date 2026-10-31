// Shared by the clipboard service (main process) and its UI.

export type ClipKind = 'text' | 'link' | 'color' | 'image'
export type ClipFilter = 'all' | ClipKind

export interface ClipImage {
  /** Paths relative to the widget's dataDir. */
  file: string
  thumb: string
  width: number
  height: number
  bytes: number
}

/** What's stored on disk. */
export interface ClipItem {
  id: string
  kind: ClipKind
  createdAt: number
  pinned: boolean
  /** Content hash, used to fold repeat copies into one item. */
  hash: string
  text?: string
  image?: ClipImage
  /** Friendly name of the app it was copied from, when known. */
  source?: string
}

/** What lists show: no full text, so long items stay cheap to send. */
export interface ClipPreview {
  id: string
  kind: ClipKind
  createdAt: number
  pinned: boolean
  source?: string
  /** First few hundred characters, whitespace collapsed. */
  preview: string
  /** Full text, included only when short, so rows can be dragged without a round trip. */
  text?: string
  words?: number
  chars?: number
  thumbUrl?: string
  thumbFile?: string
  imageFile?: string
  width?: number
  height?: number
  bytes?: number
}

export interface ClipDetail extends ClipPreview {
  text?: string
  imageUrl?: string
}

export interface ClipQuery {
  filter?: ClipFilter
  search?: string
  limit?: number
}

export interface ClipQueryResult {
  items: ClipPreview[]
  /** Per-filter totals, ignoring the search text. */
  counts: Record<ClipFilter, number>
  paused: boolean
}

export const KIND_LABEL: Record<ClipKind, string> = {
  text: 'Text',
  link: 'Link',
  color: 'Color',
  image: 'Image'
}
