import { useNow } from '@renderer/lib/format'
import { formatClock } from '@shared/countdown'
import { useDrop } from './Page'

/** Home tile: whether a drop is open, and for how long. */
export function DropCard(): JSX.Element {
  const { session, received } = useDrop()
  const now = useNow(1000, !!session)

  if (session) {
    return (
      <div className="dr-card">
        <span className="dr-card-live">● Sharing</span>
        <span className="small">
          {session.files.length} {session.files.length === 1 ? 'file' : 'files'} ·{' '}
          <span className="muted">{formatClock(Math.max(0, session.expiresAt - now))} left</span>
        </span>
      </div>
    )
  }
  return (
    <div className="dr-card">
      <span className="small">Send files to your phone</span>
      <span className="muted small">
        {received.length ? `${received.length} received recently` : 'Scan a code, no app needed'}
      </span>
    </div>
  )
}
