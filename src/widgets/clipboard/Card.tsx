import { useCallback, useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import { useWidget, useWidgetEvent } from '@renderer/widgets/sdk'
import { relativeTime, useNow } from '@renderer/lib/format'
import { ClipGlyph, ID } from './parts'
import type { ClipPreview, ClipQueryResult } from './types'

/** Home tile: the two most relevant items, each one click from the clipboard. */
export function ClipboardCard(): JSX.Element {
  const { call } = useWidget(ID)
  const now = useNow()
  const [items, setItems] = useState<ClipPreview[] | null>(null)

  const refresh = useCallback(() => {
    call<ClipQueryResult>('query', { limit: 2 }).then((r) => setItems(r.items))
  }, [call])

  useEffect(refresh, [refresh])
  useWidgetEvent(ID, 'changed', refresh)

  if (items && items.length === 0) {
    return <span className="muted small">Nothing copied yet</span>
  }

  return (
    <div className="clip-card">
      {items?.map((item) => (
        <div key={item.id} className="clip-card-row">
          <ClipGlyph item={item} />
          <span className="clip-card-text">{item.preview}</span>
          <span className="muted small">{relativeTime(item.createdAt, now)}</span>
          <button
            className="icon-btn icon-btn-small"
            title="Copy"
            onClick={(e) => {
              e.stopPropagation()
              call('copy', item.id)
            }}
          >
            <Copy size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
