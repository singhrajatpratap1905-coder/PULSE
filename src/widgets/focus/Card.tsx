import { Pause, Play } from 'lucide-react'
import { useWidget } from '@renderer/widgets/sdk'
import { formatClock } from '@shared/countdown'
import { ID, statusText, useFocus } from './Page'

/** Home tile: time left with a play/pause button. */
export function FocusCard(): JSX.Element {
  const { call } = useWidget(ID)
  const { state, running, leftMs } = useFocus()

  return (
    <div className="fc-card">
      <div className="fc-card-text">
        <span className="big-number">{formatClock(leftMs)}</span>
        <span className="muted small">{statusText(state, running)}</span>
      </div>
      <button
        className="fc-card-btn"
        title={running ? 'Pause' : 'Start'}
        onClick={(e) => {
          e.stopPropagation()
          call(running ? 'pause' : 'start')
        }}
      >
        {running ? <Pause size={16} /> : <Play size={16} />}
      </button>
    </div>
  )
}
