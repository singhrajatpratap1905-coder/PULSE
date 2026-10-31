import type { LucideIcon } from 'lucide-react'

/** Placeholder Page for widgets that are registered but not built yet. */
export function comingSoon(name: string, Icon: LucideIcon): () => JSX.Element {
  return function ComingSoon() {
    return (
      <div className="empty-page">
        <Icon size={28} strokeWidth={1.5} />
        <p>{name}</p>
        <span className="muted small">This widget arrives in a later phase.</span>
      </div>
    )
  }
}
