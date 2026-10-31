import { ItemIcon, shelfSummary, useShelfState } from './Page'

/** Home tile: the active shelf at a glance. */
export function ShelfCard(): JSX.Element {
  const { active } = useShelfState()
  if (!active) return <span />

  if (!active.items.length) {
    return <span className="muted small">Drop files on the notch to park them</span>
  }

  return (
    <div className="sh-card">
      <div className="sh-card-icons">
        {active.items.slice(0, 4).map((item) => (
          <ItemIcon key={item.id} item={item} size={30} />
        ))}
      </div>
      <span className="small">
        <strong>{active.name}</strong> <span className="muted">· {shelfSummary(active)}</span>
      </span>
    </div>
  )
}
