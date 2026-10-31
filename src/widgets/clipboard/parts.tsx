import { FileText, Link2 } from 'lucide-react'
import { fileDragProps, textDragProps } from '@renderer/widgets/sdk'
import type { ClipPreview } from './types'

export const ID = 'clipboard'

/** Small leading visual for a row: thumbnail, color swatch, or kind icon. */
export function ClipGlyph({ item }: { item: ClipPreview }): JSX.Element {
  if (item.kind === 'image' && item.thumbUrl) {
    return <img className="clip-glyph clip-thumb" src={item.thumbUrl} alt="" draggable={false} />
  }
  if (item.kind === 'color') {
    return <span className="clip-glyph clip-swatch" style={{ background: item.preview }} />
  }
  const Icon = item.kind === 'link' ? Link2 : FileText
  return (
    <span className="clip-glyph">
      <Icon size={14} />
    </span>
  )
}

export function linkHref(text: string): string {
  const t = text.trim()
  return /^www\./i.test(t) ? `https://${t}` : t
}

/** Drag handlers for an item, or {} when its content isn't available here. */
export function clipDragProps(item: ClipPreview, fullText?: string): object {
  if (item.kind === 'image') return item.imageFile ? fileDragProps(ID, item.imageFile) : {}
  const text = fullText ?? item.text
  if (text === undefined) return {}
  return textDragProps(text, item.kind === 'link' ? linkHref(text) : undefined)
}
