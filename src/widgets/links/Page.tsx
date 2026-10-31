import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowUpRight, Pencil, Plus, Search, X } from 'lucide-react'
import { useWidget, useWidgetEvent } from '@renderer/widgets/sdk'
import { ENGINES, hostOf, normalizeUrl, type Link } from './types'

export const ID = 'links'

export function useLinks(): Link[] | null {
  const { call } = useWidget(ID)
  const [links, setLinks] = useState<Link[] | null>(null)
  const refresh = useCallback(() => {
    call<Link[]>('list').then(setLinks)
  }, [call])
  useEffect(refresh, [refresh])
  useWidgetEvent(ID, 'changed', refresh)
  return links
}

// A stable, muted color per site so the initials avatars are easy to tell apart.
const HUES = [210, 260, 330, 20, 45, 150, 185]
export function Avatar({ link, size }: { link: Link; size: number }): JSX.Element {
  const host = hostOf(link.url)
  const hue = HUES[[...host].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % HUES.length]
  return (
    <span
      className="ln-avatar"
      style={{ width: size, height: size, fontSize: size * 0.45, background: `hsl(${hue} 35% 22%)`, color: `hsl(${hue} 70% 78%)` }}
    >
      {(link.title || host).charAt(0).toUpperCase()}
    </span>
  )
}

export function LinksPage(): JSX.Element {
  const { call } = useWidget(ID)
  const links = useLinks()
  const [query, setQuery] = useState('')
  const [engine, setEngine] = useState(ENGINES[0].id)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)

  const asUrl = normalizeUrl(query)
  const needle = query.trim().toLowerCase()
  const shown = (links ?? []).filter(
    (l) => !needle || asUrl || l.title.toLowerCase().includes(needle) || l.url.toLowerCase().includes(needle)
  )

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    if (!query.trim()) return
    if (asUrl) call('openUrl', asUrl)
    else call('search', engine, query)
  }

  return (
    <div className="ln">
      <form className="ln-search" onSubmit={submit}>
        <label className="ln-search-box">
          <Search size={14} />
          <input
            autoFocus
            placeholder="Search the web, filter links, or paste an address"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                e.stopPropagation()
                setQuery('')
              }
            }}
          />
          <button className="btn btn-primary btn-small" type="submit" disabled={!query.trim()}>
            {asUrl ? 'Open' : 'Search'} <ArrowUpRight size={13} />
          </button>
        </label>
        <div className="ln-engines">
          {ENGINES.map((e) => (
            <button
              key={e.id}
              type="button"
              className={`chip${engine === e.id ? ' chip-active' : ''}`}
              onClick={() => setEngine(e.id)}
            >
              {e.name}
            </button>
          ))}
          {asUrl && !links?.some((l) => l.url === asUrl) && (
            <button
              type="button"
              className="chip ln-save-chip"
              onClick={() => {
                call('add', asUrl)
                setQuery('')
              }}
            >
              <Plus size={12} /> Save {hostOf(asUrl)}
            </button>
          )}
        </div>
      </form>

      <section className="ln-saved">
        <header className="ln-saved-head">
          <span className="section-label">Saved links {links ? `· ${links.length}` : ''}</span>
          <button className="btn btn-small" onClick={() => setAdding(true)}>
            <Plus size={13} /> Add link
          </button>
        </header>
        <div className="ln-grid">
          {adding && <LinkForm onDone={() => setAdding(false)} />}
          {shown.map((link) =>
            editing === link.id ? (
              <LinkForm key={link.id} link={link} onDone={() => setEditing(null)} />
            ) : (
              <div key={link.id} className="ln-item" onClick={() => call('open', link.id)} title={link.url}>
                <Avatar link={link} size={30} />
                <span className="ln-item-text">
                  <span className="ln-item-title">{link.title}</span>
                  <span className="muted small ln-item-host">{hostOf(link.url)}</span>
                </span>
                <span className="ln-item-actions">
                  <button
                    className="icon-btn icon-btn-small"
                    title="Edit"
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditing(link.id)
                    }}
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    className="icon-btn icon-btn-small"
                    title="Remove"
                    onClick={(e) => {
                      e.stopPropagation()
                      call('remove', link.id)
                    }}
                  >
                    <X size={12} />
                  </button>
                </span>
              </div>
            )
          )}
          {links && links.length === 0 && !adding && (
            <div className="muted small ln-empty">Save the sites you open every day. Paste an address above to start.</div>
          )}
        </div>
      </section>
    </div>
  )
}

function LinkForm({ link, onDone }: { link?: Link; onDone: () => void }): JSX.Element {
  const { call } = useWidget(ID)
  const [url, setUrl] = useState(link?.url ?? '')
  const [title, setTitle] = useState(link?.title ?? '')
  const valid = !!normalizeUrl(url)

  const save = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!valid) return
    if (link) await call('update', link.id, { url, title })
    else await call('add', url, title)
    onDone()
  }

  return (
    <form className="ln-form" onSubmit={save} onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), onDone())}>
      <input
        className={`field${url && !valid ? ' invalid' : ''}`}
        placeholder="Address, e.g. github.com"
        value={url}
        autoFocus
        onChange={(e) => setUrl(e.target.value)}
      />
      <input className="field" placeholder="Name (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <button className="btn btn-primary btn-small" type="submit" disabled={!valid}>
        Save
      </button>
      <button className="icon-btn" type="button" title="Cancel" onClick={onDone}>
        <X size={14} />
      </button>
    </form>
  )
}
