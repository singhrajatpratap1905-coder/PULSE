import { useWidget } from '@renderer/widgets/sdk'
import { Avatar, ID, useLinks } from './Page'

/** Home tile: the four most used links, one click to open. */
export function LinksCard(): JSX.Element {
  const { call } = useWidget(ID)
  const links = useLinks()

  if (links && links.length === 0) return <span className="muted small">No saved links yet</span>

  return (
    <div className="ln-card">
      {links?.slice(0, 4).map((link) => (
        <button
          key={link.id}
          className="ln-card-link"
          title={link.url}
          onClick={(e) => {
            e.stopPropagation()
            call('open', link.id)
          }}
        >
          <Avatar link={link} size={22} />
          <span className="ln-card-title">{link.title}</span>
        </button>
      ))}
    </div>
  )
}
