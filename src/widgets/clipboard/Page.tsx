import { Fragment, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ExternalLink, Pause, Pin, PinOff, Play, Search, Trash2, X } from 'lucide-react'
import { useWidget, useWidgetEvent } from '@renderer/widgets/sdk'
import { usePulse } from '@renderer/store'
import { formatBytes, relativeTime, useNow } from '@renderer/lib/format'
import { ClipGlyph, clipDragProps, ID } from './parts'
import { KIND_LABEL, type ClipDetail, type ClipFilter, type ClipPreview, type ClipQueryResult } from './types'

const FILTERS: Array<[ClipFilter, string]> = [
  ['all', 'All'],
  ['text', 'Text'],
  ['link', 'Links'],
  ['color', 'Colors'],
  ['image', 'Images']
]

const DAY = 86_400_000

function groupLabel(item: ClipPreview, todayStart: number): string {
  if (item.pinned) return 'Pinned'
  if (item.createdAt >= todayStart) return 'Today'
  if (item.createdAt >= todayStart - DAY) return 'Yesterday'
  return 'Earlier'
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

function rowMeta(item: ClipPreview, now: number): string {
  const when = relativeTime(item.createdAt, now)
  if (item.kind === 'image') return `${item.width} × ${item.height} · ${when}`
  if (item.kind === 'text') return `${plural(item.words ?? 0, 'word')} · ${when}`
  return `${KIND_LABEL[item.kind]} · ${when}`
}

function footerStats(item: ClipPreview): string {
  if (item.kind === 'image') return `${item.width} × ${item.height} · ${formatBytes(item.bytes ?? 0)}`
  if (item.kind === 'text') return `${plural(item.words ?? 0, 'word')} · ${plural(item.chars ?? 0, 'char')}`
  return plural(item.chars ?? 0, 'char')
}

export function ClipboardPage(): JSX.Element {
  const { call } = useWidget(ID)
  const closePanel = usePulse((s) => s.close)
  const now = useNow()

  const [filter, setFilter] = useState<ClipFilter>('all')
  const [search, setSearch] = useState('')
  const [result, setResult] = useState<ClipQueryResult | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const rowsRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(() => {
    call<ClipQueryResult>('query', { filter, search }).then(setResult)
  }, [call, filter, search])

  useEffect(refresh, [refresh])
  useWidgetEvent(ID, 'changed', refresh)

  const items = result?.items ?? []
  const selected = items.find((i) => i.id === selectedId) ?? items[0] ?? null

  useEffect(() => {
    if (!confirmClear) return
    const timer = setTimeout(() => setConfirmClear(false), 3000)
    return () => clearTimeout(timer)
  }, [confirmClear])

  const select = (id: string): void => {
    setSelectedId(id)
    requestAnimationFrame(() =>
      rowsRef.current?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' })
    )
  }

  const copy = async (id: string, thenClose: boolean): Promise<void> => {
    await call('copy', id)
    if (thenClose) closePanel()
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    const index = selected ? items.indexOf(selected) : -1
    const inInput = e.target instanceof HTMLInputElement
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = items[Math.min(items.length - 1, Math.max(0, index + (e.key === 'ArrowDown' ? 1 : -1)))]
      if (next) select(next.id)
    } else if (e.key === 'Enter' && selected) {
      e.preventDefault()
      copy(selected.id, true)
    } else if (e.key === 'Delete' && selected && !inInput) {
      call('remove', selected.id)
    } else if (e.key === 'f' && e.ctrlKey) {
      e.preventDefault()
      searchRef.current?.focus()
    } else if (e.key === 'p' && e.ctrlKey && selected) {
      e.preventDefault()
      call('setPinned', selected.id, !selected.pinned)
    }
  }

  const todayStart = new Date(now).setHours(0, 0, 0, 0)
  const groups: Array<{ label: string; items: ClipPreview[] }> = []
  for (const item of items) {
    const label = groupLabel(item, todayStart)
    if (groups.at(-1)?.label !== label) groups.push({ label, items: [] })
    groups.at(-1)!.items.push(item)
  }

  return (
    <div className="clip" onKeyDown={onKeyDown}>
      <section className="clip-list">
        <div className="clip-toolbar">
          <div className="clip-tabs">
            {FILTERS.map(([id, label]) => (
              <button
                key={id}
                className={`clip-tab${filter === id ? ' active' : ''}`}
                onClick={() => setFilter(id)}
              >
                {label}
                <span className="clip-count">{result?.counts[id] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="clip-tools">
            <button
              className="icon-btn"
              title={result?.paused ? 'Resume saving copies' : 'Pause saving copies'}
              onClick={() => call('setPaused', !result?.paused)}
            >
              {result?.paused ? <Play size={14} /> : <Pause size={14} />}
            </button>
            <button
              className={`icon-btn${confirmClear ? ' danger' : ''}`}
              title={confirmClear ? 'Click again to clear (pinned items stay)' : 'Clear history'}
              onClick={() => {
                if (!confirmClear) return setConfirmClear(true)
                setConfirmClear(false)
                call('clear')
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        <label className="clip-search">
          <Search size={14} />
          <input
            ref={searchRef}
            autoFocus
            placeholder="Search clipboard"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && search) {
                e.stopPropagation()
                setSearch('')
              }
            }}
          />
          {search && (
            <button className="clip-search-clear" onClick={() => setSearch('')} title="Clear search">
              <X size={12} />
            </button>
          )}
        </label>

        {result?.paused && (
          <div className="clip-banner">Paused. New copies aren't being saved.</div>
        )}

        <div className="clip-rows" ref={rowsRef}>
          {groups.map((group) => (
            <Fragment key={group.label}>
              <div className="clip-section">{group.label}</div>
              {group.items.map((item) => (
                <div
                  key={item.id}
                  data-id={item.id}
                  className={`clip-row${item.id === selected?.id ? ' selected' : ''}`}
                  onMouseDown={() => setSelectedId(item.id)}
                  onDoubleClick={() => copy(item.id, true)}
                  title="Double-click to copy and close · drag into any app"
                  {...clipDragProps(item)}
                >
                  <ClipGlyph item={item} />
                  <span className="clip-row-main">
                    <span className="clip-row-title">{item.preview}</span>
                    <span className="clip-row-meta">{rowMeta(item, now)}</span>
                  </span>
                  {item.pinned && <Pin size={12} className="clip-row-pin" />}
                </div>
              ))}
            </Fragment>
          ))}
          {result && items.length === 0 && (
            <div className="clip-empty muted small">
              {search ? 'Nothing matches your search.' : 'Copy something and it shows up here.'}
            </div>
          )}
        </div>
      </section>

      {selected ? (
        <DetailPane key={selected.id} item={selected} onCopy={() => copy(selected.id, false)} />
      ) : (
        <section className="clip-detail clip-detail-empty muted small">Nothing selected</section>
      )}
    </div>
  )
}

function DetailPane({ item, onCopy }: { item: ClipPreview; onCopy: () => Promise<void> }): JSX.Element {
  const { call } = useWidget(ID)
  const now = useNow()
  const [detail, setDetail] = useState<ClipDetail | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    call<ClipDetail | null>('get', item.id).then(setDetail)
  }, [call, item.id])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1200)
    return () => clearTimeout(timer)
  }, [copied])

  const text = detail?.text ?? item.text

  return (
    <section className="clip-detail">
      <header className="clip-detail-head">
        <span className="muted small">
          {KIND_LABEL[item.kind]} · {relativeTime(item.createdAt, now)}
          {item.source && ` · ${item.source}`}
        </span>
        <span className="clip-detail-actions">
          <button
            className="icon-btn"
            title={item.pinned ? 'Unpin (Ctrl+P)' : 'Pin (Ctrl+P)'}
            onClick={() => call('setPinned', item.id, !item.pinned)}
          >
            {item.pinned ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
          <button className="icon-btn" title="Delete (Del)" onClick={() => call('remove', item.id)}>
            <Trash2 size={14} />
          </button>
        </span>
      </header>

      <div className="clip-detail-body" {...clipDragProps(item, text)}>
        {item.kind === 'image' && detail?.imageUrl && (
          <img className="clip-image" src={detail.imageUrl} alt="" draggable={false} />
        )}
        {item.kind === 'color' && (
          <div className="clip-color">
            <span className="clip-color-swatch" style={{ background: item.preview }} />
            <span className="clip-color-value">{item.preview}</span>
          </div>
        )}
        {item.kind === 'link' && <p className="clip-link">{text}</p>}
        {item.kind === 'text' && <pre className="clip-text">{text}</pre>}
      </div>

      <footer className="clip-detail-foot">
        <span className="muted small">{footerStats(item)}</span>
        <span className="clip-detail-actions">
          {item.kind === 'link' && (
            <button className="btn btn-small" onClick={() => call('openLink', item.id)}>
              <ExternalLink size={13} /> Open
            </button>
          )}
          <button
            className="btn btn-primary btn-small"
            onClick={() => onCopy().then(() => setCopied(true))}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </span>
      </footer>
    </section>
  )
}
