import { AppIcon, useScreenTime, WeekBars } from './Page'
import { formatUsage } from './types'

/** Home tile: today's total, the top app, and the week as tiny bars. */
export function ScreenTimeCard(): JSX.Element {
  const s = useScreenTime()
  const top = s.today.apps[0]

  return (
    <div className="stm-card">
      <div className="stm-card-text">
        <span className="big-number">{formatUsage(s.today.seconds)}</span>
        {top ? (
          <span className="stm-card-top small">
            <AppIcon app={top} size={14} />
            <span className="stm-card-top-name">{top.name}</span>
            <span className="muted">· {formatUsage(top.seconds)}</span>
          </span>
        ) : (
          <span className="muted small">{s.paused ? 'Paused' : 'Today'}</span>
        )}
      </div>
      <WeekBars week={s.week} height={38} />
    </div>
  )
}
