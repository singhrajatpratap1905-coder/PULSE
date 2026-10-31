import { useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { File, Folder, FolderOpen, Plus, Trash2, X } from 'lucide-react'
import { fileDragProps, useWidget, useWidgetValue } from '@renderer/widgets/sdk'
import { usePulse } from '@renderer/store'
import { formatBytes } from '@renderer/lib/format'
import type { ShelfItemView, ShelfState, ShelfView } from './types'

export const ID = 'shelf'

const INITIAL: ShelfState = { shelves: [], activeId: '' }

export function useShelfState(): { state: ShelfState; active: ShelfView | undefined } {
  const state = useWidgetValue(ID, 'getState', 'state', INITIAL)
  return { state, active: state.shelves.find((s) => s.id === state.activeId) ?? state.shelves[0] }
}

export function ItemIcon({ item, size }: { item: ShelfItemView; size: number }): JSX.Element {
  if (item.icon && !item.missing) {
    return <img className="sh-icon" src={item.icon} alt="" width={size} height={size} draggable={false} />
  }
  const Icon = item.isDir ? Folder : File
  return <Icon className="sh-icon sh-icon-fallback" size={size * 0.7} strokeWidth={1.25} />
}

export function shelfSummary(shelf: ShelfView): string {
  const n = shelf.items.length
  return `${n} ${n === 1 ? 'item' : 'items'}${shelf.totalBytes ? ` · ${formatBytes(shelf.totalBytes)}` : ''}`
}

export function ShelfPage(): JSX.Element {
  const { call } = useWidget(ID)
  const { state, active } = useShelfState()
  const fileDragOver = usePulse((s) => s.fileDragOver)
  const [selected, setSelected] = useState<string[]>([])
  const [anchor, setAnchor] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const items = active?.items ?? []

  // Selection only makes sense within the shelf on screen.
  useEffect(() => setSelected([]), [active?.id])
  useEffect(() => {
    if (!confirmClear) return
    const timer = setTimeout(() => setConfirmClear(false), 3000)
    return () => clearTimeout(timer)
  }, [confirmClear])

  const select = (e: MouseEvent, id: string): void => {
    if (e.shiftKey && anchor) {
      const a = items.findIndex((i) => i.id === anchor)
      const b = items.findIndex((i) => i.id === id)
      setSelected(items.slice(Math.min(a, b), Math.max(a, b) + 1).map((i) => i.id))
      return
    }
    setAnchor(id)
    if (e.ctrlKey) setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
    else setSelected([id])
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (!active) return
    if (e.key === 'a' && e.ctrlKey) {
      e.preventDefault()
      setSelected(items.map((i) => i.id))
    } else if (e.key === 'Delete' && selected.length) {
      call('remove', active.id, selected)
      setSelected([])
    } else if (e.key === 'Enter' && selected.length) {
      call('open', selected[0])
    }
  }

  return (
    <div className="sh" onKeyDown={onKeyDown} tabIndex={-1}>
      <Shelves state={state} />

      <section className="sh-main">
        {active && (
          <>
            <header className="sh-head">
              <div className="sh-head-title">
                <strong>{active.name}</strong>
                <span className="muted small">{shelfSummary(active)}</span>
              </div>
              <div className="sh-head-actions">
                {items.length > 0 && (
                  <button className="link-btn" onClick={() => setSelected(items.map((i) => i.id))}>
                    Select all
                  </button>
                )}
                <button className="btn btn-small" onClick={() => call('pickFiles', active.id)}>
                  <Plus size={13} /> Add files
                </button>
                {items.length > 0 && (
                  <button
                    className={`icon-btn${confirmClear ? ' danger' : ''}`}
                    title={confirmClear ? 'Click again to empty this shelf (files stay on disk)' : 'Empty shelf'}
                    onClick={() => {
                      if (!confirmClear) return setConfirmClear(true)
                      setConfirmClear(false)
                      call('clear', active.id)
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </header>

            <div className="sh-grid" onMouseDown={(e) => e.target === e.currentTarget && setSelected([])}>
              {items.map((item) => (
                <Tile
                  key={item.id}
                  item={item}
                  selected={selected.includes(item.id)}
                  dragRef={(selected.includes(item.id) ? selected : [item.id]).join(',')}
                  onSelect={(e) => select(e, item.id)}
                  onRemove={() => call('remove', active.id, [item.id])}
                />
              ))}
              {items.length === 0 && (
                <div className="sh-empty muted small">
                  <FolderOpen size={26} strokeWidth={1.5} />
                  Drop files on the notch to park them here.
                  <br />
                  Drag them back out whenever you need them.
                </div>
              )}
            </div>

            <footer className="sh-foot muted small">
              Shelves keep links to your files. Nothing is copied or moved.
            </footer>
          </>
        )}

        {fileDragOver && active && (
          <div className="sh-drop">
            <FolderOpen size={28} strokeWidth={1.5} />
            Drop to add to {active.name}
          </div>
        )}
      </section>
    </div>
  )
}

function Tile({
  item,
  selected,
  dragRef,
  onSelect,
  onRemove
}: {
  item: ShelfItemView
  selected: boolean
  dragRef: string
  onSelect: (e: MouseEvent) => void
  onRemove: () => void
}): JSX.Element {
  const { call } = useWidget(ID)
  const meta = item.missing ? 'Missing' : item.isDir ? 'Folder' : formatBytes(item.size ?? 0)

  return (
    <div
      className={`sh-tile${selected ? ' selected' : ''}${item.missing ? ' missing' : ''}`}
      title={`${item.path}\nDouble-click to open · drag into any app`}
      onMouseDown={onSelect}
      onDoubleClick={() => call('open', item.id)}
      {...(item.missing ? {} : fileDragProps(ID, dragRef))}
    >
      <div className="sh-tile-actions">
        {!item.missing && (
          <button
            className="icon-btn icon-btn-small"
            title="Show in folder"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => call('reveal', item.id)}
          >
            <FolderOpen size={12} />
          </button>
        )}
        <button
          className="icon-btn icon-btn-small"
          title="Remove from shelf"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onRemove}
        >
          <X size={12} />
        </button>
      </div>
      <ItemIcon item={item} size={48} />
      <span className="sh-tile-name">{item.name}</span>
      <span className="sh-tile-meta">{meta}</span>
    </div>
  )
}

function Shelves({ state }: { state: ShelfState }): JSX.Element {
  const { call } = useWidget(ID)
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  useEffect(() => {
    if (!confirmDelete) return
    const timer = setTimeout(() => setConfirmDelete(null), 3000)
    return () => clearTimeout(timer)
  }, [confirmDelete])

  return (
    <aside className="sh-shelves">
      <span className="section-label sh-shelves-label">Shelves</span>
      {state.shelves.map((s) =>
        renaming === s.id ? (
          <NameInput
            key={s.id}
            initial={s.name}
            onDone={(name) => {
              if (name) call('renameShelf', s.id, name)
              setRenaming(null)
            }}
          />
        ) : (
          <div
            key={s.id}
            className={`sh-shelf${s.id === state.activeId ? ' active' : ''}`}
            onClick={() => call('setActive', s.id)}
            onDoubleClick={() => setRenaming(s.id)}
            title="Double-click to rename"
          >
            <span className="sh-shelf-name">{s.name}</span>
            <span className="sh-shelf-count">{s.items.length}</span>
            {state.shelves.length > 1 && (
              <button
                className={`icon-btn icon-btn-small sh-shelf-delete${confirmDelete === s.id ? ' danger' : ''}`}
                title={confirmDelete === s.id ? 'Click again to delete this shelf' : 'Delete shelf'}
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirmDelete !== s.id) return setConfirmDelete(s.id)
                  call('deleteShelf', s.id)
                }}
              >
                <X size={11} />
              </button>
            )}
          </div>
        )
      )}
      {adding ? (
        <NameInput
          initial=""
          onDone={(name) => {
            if (name) call('createShelf', name)
            setAdding(false)
          }}
        />
      ) : (
        <button className="sh-new" onClick={() => setAdding(true)}>
          <Plus size={13} /> New shelf
        </button>
      )}
    </aside>
  )
}

function NameInput({ initial, onDone }: { initial: string; onDone: (name: string) => void }): JSX.Element {
  const [value, setValue] = useState(initial)
  return (
    <input
      className="field sh-name-input"
      autoFocus
      maxLength={40}
      placeholder="Shelf name"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onDone(value.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone(value.trim())
        if (e.key === 'Escape') {
          e.stopPropagation()
          onDone('')
        }
      }}
    />
  )
}
