import type { MouseEvent } from 'react'
import { Plus } from 'lucide-react'
import { useWidget } from '@renderer/widgets/sdk'
import { usePulse } from '@renderer/store'
import { relativeTime, useNow } from '@renderer/lib/format'
import { ID } from './Editor'
import { useNoteList } from './Page'

/** Home tile: the latest note, its checklist progress, and a quick "new note". */
export function NotesCard(): JSX.Element {
  const { call } = useWidget(ID)
  const setTab = usePulse((s) => s.setTab)
  const now = useNow()
  const latest = useNoteList()?.[0]

  const create = async (e: MouseEvent): Promise<void> => {
    e.stopPropagation()
    await call('create')
    setTab(ID)
  }

  const when = latest && relativeTime(latest.updatedAt, now)

  return (
    <div className="nt-card">
      <div className="nt-card-text">
        {latest ? (
          <>
            <span className="nt-card-title">{latest.title}</span>
            {latest.checklist.total > 0 && (
              <span className="small">
                {latest.checklist.done}/{latest.checklist.total} done
              </span>
            )}
            <span className="muted small">Edited {when === 'now' ? 'just now' : `${when} ago`}</span>
          </>
        ) : (
          <span className="muted small">No notes yet</span>
        )}
      </div>
      <button className="icon-btn" title="New note" onClick={create}>
        <Plus size={16} />
      </button>
    </div>
  )
}
