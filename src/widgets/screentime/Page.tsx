import { useEffect, useState } from 'react'
import { AppWindow, Pause, Play, Trash2 } from 'lucide-react'
import { useWidget, useWidgetLive, useWidgetValue } from '@renderer/widgets/sdk'
import { formatUsage, type AppUsage, type DayTotal, type ScreenTimeState } from './types'

export const ID = 'screentime'

const INITIAL: ScreenTimeState = { today: { date: '', seconds: 0, apps: [] }, week: [], paused: false }

/** Today's totals, kept fresh while the calling component is on screen. */
export function useScreenTime(): ScreenTimeState {
  useWidgetLive(ID, 5000)
  return useWidgetValue(ID, 'getState', 'state', INITIAL)
}

export function AppIcon({ app, size }: { app: AppUsage; size: number }): JSX.Element {
  return app.icon ? (
    <img className="stm-icon" src={app.icon} alt="" width={size} height={size} draggable={false} />
  ) : (
    <AppWindow className="stm-icon stm-icon-fallback" size={size} strokeWidth={1.5} />
  )
}

const weekday = (date: string): string =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })

/** Seven bars, today last and highlighted. */
export function WeekBars({ week, height, labels }: { week: DayTotal[]; height: number; labels?: boolean }): JSX.Element {
  const max = Math.max(3600, ...week.map((d) => d.seconds))
  return (
    <div className="stm-week" style={{ height }}>
      {week.map((d, i) => (
        <div key={d.date} className="stm-week-col" title={`${d.date}: ${formatUsage(d.seconds)}`}>
          <div className="stm-week-track">
            <span
              className={`stm-week-bar${i === week.length - 1 ? ' today' : ''}`}
              style={{ height: `${Math.max(d.seconds ? 4 : 0, (d.seconds / max) * 100)}%` }}
            />
          </div>
          {labels && <span className="stm-week-label">{weekday(d.date)}</span>}
        </div>
      ))}
    </div>
  )
}

export function ScreenTimePage(): JSX.Element {
  const { call } = useWidget(ID)
  const s = useScreenTime()
  const [confirmClear, setConfirmClear] = useState(false)
  const top = s.today.apps[0]?.seconds || 1
  const daysWithUse = s.week.filter((d) => d.seconds > 0)
  const average = daysWithUse.length
    ? daysWithUse.reduce((sum, d) => sum + d.seconds, 0) / daysWithUse.length
    : 0

  useEffect(() => {
    if (!confirmClear) return
    const timer = setTimeout(() => setConfirmClear(false), 3000)
    return () => clearTimeout(timer)
  }, [confirmClear])

  return (
    <div className="stm">
      <section className="stm-today">
        <header className="stm-head">
          <div>
            <span className="section-label">Today</span>
            <div className="big-number">{formatUsage(s.today.seconds)}</div>
          </div>
          <div className="stm-tools">
            <button
              className="icon-btn"
              title={s.paused ? 'Resume tracking' : 'Pause tracking'}
              onClick={() => call('setPaused', !s.paused)}
            >
              {s.paused ? <Play size={14} /> : <Pause size={14} />}
            </button>
            <button
              className={`icon-btn${confirmClear ? ' danger' : ''}`}
              title={confirmClear ? 'Click again to delete all screen time history' : 'Delete history'}
              onClick={() => {
                if (!confirmClear) return setConfirmClear(true)
                setConfirmClear(false)
                call('clear')
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </header>
        {s.paused && <div className="stm-banner">Paused. Time isn't being counted.</div>}
        <div className="stm-apps">
          {s.today.apps.map((a) => (
            <div key={a.key} className="stm-app">
              <AppIcon app={a} size={20} />
              <div className="stm-app-main">
                <div className="stm-app-row">
                  <span className="stm-app-name">{a.name}</span>
                  <span className="muted small">{formatUsage(a.seconds)}</span>
                </div>
                <div className="stm-app-track">
                  <span style={{ width: `${(a.seconds / top) * 100}%` }} />
                </div>
              </div>
            </div>
          ))}
          {s.today.apps.length === 0 && (
            <div className="muted small stm-empty">Time you spend in apps today shows up here.</div>
          )}
        </div>
      </section>

      <section className="stm-side">
        <span className="section-label">This week</span>
        <WeekBars week={s.week} height={130} labels />
        <div className="stm-avg">
          <span className="muted small">Daily average</span>
          <strong>{formatUsage(average)}</strong>
        </div>
        <p className="muted small stm-note">
          Counted only while you're active. App names stay on this PC; window titles are never recorded.
        </p>
      </section>
    </div>
  )
}
