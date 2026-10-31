import { useCallback, useEffect, useState } from 'react'
import { Eye, PenLine, Plus, Search, Trash2 } from 'lucide-react'
import { useWidget, useWidgetEvent } from '@renderer/widgets/sdk'
import { relativeTime, useNow } from '@renderer/lib/format'
import { Editor, ID } from './Editor'
import { checklistStats, type Note, type NotePreview } from './types'

export function useNoteList(search = ''): NotePreview[] | null {
  const { call } = useWidget(ID)
  const [notes, setNotes] = useState<NotePreview[] | null>(null)
  const refresh = useCallback(() => {
    call<NotePreview[]>('list', search).then(setNotes)
  }, [call, search])
  useEffect(refresh, [refresh])
  useWidgetEvent(ID, 'changed', refresh)
  return notes
}

export function NotesPage(): JSX.Element {
  const { call } = useWidget(ID)
  const now = useNow()
  const [search, setSearch] = useState('')
  const notes = useNoteList(search)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [note, setNote] = useState<Note | null>(null)
  const [mode, setMode] = useState<'edit' | 'view'>('edit')
  const [stats, setStats] = useState({ done: 0, total: 0 })
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Newest note is selected by default, which is also where "New note" lands.
  const activeId = selectedId && notes?.some((n) => n.id === selectedId) ? selectedId : (notes?.[0]?.id ?? null)

  useEffect(() => {
    setConfirmDelete(false)
    if (!activeId) return setNote(null)
    call<Note | null>('get', activeId).then((n) => {
      setNote(n)
      if (n) setStats(checklistStats(n.body))
      // Checklists open ready to tick; everything else opens ready to type.
      setMode(n && checklistStats(n.body).total > 0 ? 'view' : 'edit')
    })
  }, [activeId, call])

  useEffect(() => {
    if (!confirmDelete) return
    const timer = setTimeout(() => setConfirmDelete(false), 3000)
    return () => clearTimeout(timer)
  }, [confirmDelete])

  // The list refreshes on every save, so it has the freshest edit time.
  const updatedAt = notes?.find((n) => n.id === activeId)?.updatedAt ?? note?.updatedAt ?? now
  const edited = relativeTime(updatedAt, now)

  const create = async (): Promise<void> => {
    setSearch('')
    const id = await call<string>('create')
    setSelectedId(id)
  }

  return (
    <div className="nt">
      <section className="nt-list">
        <div className="nt-list-head">
          <label className="nt-search">
            <Search size={13} />
            <input placeholder="Search notes" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <button className="icon-btn" title="New note" onClick={create}>
            <Plus size={16} />
          </button>
        </div>
        <div className="nt-rows">
          {notes?.map((n) => (
            <button
              key={n.id}
              className={`nt-row${n.id === activeId ? ' selected' : ''}`}
              onClick={() => setSelectedId(n.id)}
            >
              <span className="nt-row-title">{n.title}</span>
              <span className="nt-row-meta">
                {relativeTime(n.updatedAt, now)}
                {n.checklist.total > 0 && ` · ${n.checklist.done}/${n.checklist.total}`}
                {n.snippet && ` · ${n.snippet}`}
              </span>
            </button>
          ))}
          {notes && notes.length === 0 && (
            <div className="nt-empty muted small">
              {search ? 'No notes match.' : 'No notes yet.'}
              {!search && (
                <button className="btn btn-small" onClick={create}>
                  <Plus size={13} /> New note
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="nt-editor">
        {note ? (
          <>
            <header className="nt-editor-head">
              <span className="muted small">
                Edited {edited === 'now' ? 'just now' : `${edited} ago`}
                {stats.total > 0 && ` · ${stats.done}/${stats.total} done`}
              </span>
              <span className="nt-editor-actions">
                <button
                  className="icon-btn"
                  title={mode === 'edit' ? 'Checklist view' : 'Edit'}
                  onClick={() => setMode(mode === 'edit' ? 'view' : 'edit')}
                >
                  {mode === 'edit' ? <Eye size={14} /> : <PenLine size={14} />}
                </button>
                <button
                  className={`icon-btn${confirmDelete ? ' danger' : ''}`}
                  title={confirmDelete ? 'Click again to delete' : 'Delete note'}
                  onClick={() => {
                    if (!confirmDelete) return setConfirmDelete(true)
                    call('remove', note.id)
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </span>
            </header>
            <Editor
              key={note.id}
              note={note}
              mode={mode}
              onBodyChange={(body) => setStats(checklistStats(body))}
              onRequestEdit={() => setMode('edit')}
            />
          </>
        ) : (
          <div className="nt-empty muted small">Select or create a note</div>
        )}
      </section>
    </div>
  )
}
