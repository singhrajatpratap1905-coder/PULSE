import { useWidget } from '@renderer/widgets/sdk'
import { useNow } from '@renderer/lib/format'
import { formatClock, formatSpan, isRunning, remainingMs } from '@shared/countdown'
import { ID, PRESETS, useTimersState } from './Page'
import { stopwatchElapsed, timerName } from './types'

/** Home tile: the timer finishing soonest, else a running stopwatch, else quick starts. */
export function TimersCard(): JSX.Element {
  const { call } = useWidget(ID)
  const state = useTimersState()
  const running = state.timers.filter(isRunning)
  const swRunning = state.stopwatch.startedAt !== null
  const now = useNow(250, running.length > 0 || swRunning)

  if (running.length) {
    const next = running.reduce((a, b) => (remainingMs(a, now) <= remainingMs(b, now) ? a : b))
    return (
      <div className="tm-card">
        <span className="big-number">{formatClock(remainingMs(next, now))}</span>
        <span className="muted small">
          {timerName(next, formatSpan)}
          {running.length > 1 && ` · ${running.length - 1} more`}
        </span>
      </div>
    )
  }

  if (swRunning) {
    return (
      <div className="tm-card">
        <span className="big-number">{formatClock(stopwatchElapsed(state.stopwatch, now), false)}</span>
        <span className="muted small">Stopwatch</span>
      </div>
    )
  }

  return (
    <div className="tm-card-presets">
      {PRESETS.filter(([text]) => ['5m', '10m', '25m'].includes(text)).map(([text, ms]) => (
        <button
          key={text}
          className="chip"
          onClick={(e) => {
            e.stopPropagation()
            call('add', { durationMs: ms })
          }}
        >
          {text}
        </button>
      ))}
    </div>
  )
}
