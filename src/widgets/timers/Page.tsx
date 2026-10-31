import { useState, type FormEvent } from 'react'
import { Flag, Pause, Play, RotateCcw, X } from 'lucide-react'
import { useWidget, useWidgetValue } from '@renderer/widgets/sdk'
import { useNow } from '@renderer/lib/format'
import {
  formatClock,
  formatSpan,
  isRunning,
  parseDuration,
  progress,
  remainingMs
} from '@shared/countdown'
import { stopwatchElapsed, timerName, type TimerItem, type TimersState } from './types'

export const ID = 'timers'

export const PRESETS: Array<[string, number]> = [
  ['1m', 60_000],
  ['3m', 180_000],
  ['5m', 300_000],
  ['10m', 600_000],
  ['15m', 900_000],
  ['25m', 1_500_000],
  ['45m', 2_700_000],
  ['1h', 3_600_000]
]

export const EMPTY_STATE: TimersState = { timers: [], stopwatch: { startedAt: null, elapsedMs: 0, laps: [] } }

export function useTimersState(): TimersState {
  return useWidgetValue(ID, 'getState', 'state', EMPTY_STATE)
}

export function TimersPage(): JSX.Element {
  const state = useTimersState()
  const [mode, setMode] = useState<'timer' | 'stopwatch'>('timer')
  const ticking = state.timers.some(isRunning) || state.stopwatch.startedAt !== null
  const now = useNow(100, ticking)

  return (
    <div className="tm">
      <section className="tm-side">
        <div className="segmented">
          <button className={mode === 'timer' ? 'active' : ''} onClick={() => setMode('timer')}>
            Timer
          </button>
          <button className={mode === 'stopwatch' ? 'active' : ''} onClick={() => setMode('stopwatch')}>
            Stopwatch
          </button>
        </div>
        {mode === 'timer' ? <NewTimer /> : <StopwatchView state={state} now={now} />}
      </section>

      <section className="tm-list">
        <header className="tm-list-head">
          <span className="section-label">Timers</span>
          {state.timers.some((t) => t.done) && <ClearDone />}
        </header>
        <div className="tm-rows">
          {state.timers.map((t) => (
            <TimerRow key={t.id} timer={t} now={now} />
          ))}
          {state.timers.length === 0 && (
            <div className="tm-empty muted small">No timers yet. Pick a preset to start one.</div>
          )}
        </div>
      </section>
    </div>
  )
}

function NewTimer(): JSX.Element {
  const { call } = useWidget(ID)
  const [duration, setDuration] = useState('')
  const [label, setLabel] = useState('')
  const parsed = parseDuration(duration)
  const invalid = duration.trim() !== '' && parsed === null

  const start = (durationMs: number): void => {
    call('add', { durationMs, label })
    setDuration('')
    setLabel('')
  }

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    if (parsed) start(parsed)
  }

  return (
    <form className="tm-new" onSubmit={submit}>
      <div className="tm-presets">
        {PRESETS.map(([text, ms]) => (
          <button type="button" key={text} className="chip" onClick={() => start(ms)}>
            {text}
          </button>
        ))}
      </div>
      <input
        className={`field${invalid ? ' invalid' : ''}`}
        placeholder="Custom: 90s, 1h30m, 10:00"
        value={duration}
        onChange={(e) => setDuration(e.target.value)}
        autoFocus
      />
      <input
        className="field"
        placeholder="Label (optional)"
        value={label}
        maxLength={60}
        onChange={(e) => setLabel(e.target.value)}
      />
      <button className="btn btn-primary" type="submit" disabled={!parsed}>
        Start {parsed ? formatSpan(parsed) : ''}
      </button>
    </form>
  )
}

function TimerRow({ timer, now }: { timer: TimerItem; now: number }): JSX.Element {
  const { call } = useWidget(ID)
  const running = isRunning(timer)
  const left = remainingMs(timer, now)
  const endsAt = timer.endsAt
    ? new Date(timer.endsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : null

  return (
    <div className={`tm-row${timer.done ? ' done' : ''}`}>
      <div className="tm-row-main">
        <span className="tm-row-name">{timerName(timer, formatSpan)}</span>
        <span className="muted small">
          {timer.done ? 'Done' : running ? `Ends ${endsAt}` : 'Paused'}
        </span>
      </div>
      <span className="tm-row-clock">{timer.done ? '0:00' : formatClock(left)}</span>
      <div className="tm-row-actions">
        <button
          className="icon-btn"
          title={timer.done ? 'Start again' : running ? 'Pause' : 'Resume'}
          onClick={() => call('toggle', timer.id)}
        >
          {running ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button className="icon-btn" title="Restart" onClick={() => call('restart', timer.id)}>
          <RotateCcw size={14} />
        </button>
        <button className="icon-btn" title="Remove" onClick={() => call('remove', timer.id)}>
          <X size={14} />
        </button>
      </div>
      <span className="tm-progress" style={{ transform: `scaleX(${timer.done ? 1 : progress(timer, now)})` }} />
    </div>
  )
}

function ClearDone(): JSX.Element {
  const { call } = useWidget(ID)
  return (
    <button className="link-btn" onClick={() => call('clearDone')}>
      Clear finished
    </button>
  )
}

function StopwatchView({ state, now }: { state: TimersState; now: number }): JSX.Element {
  const { call } = useWidget(ID)
  const sw = state.stopwatch
  const running = sw.startedAt !== null
  const elapsed = stopwatchElapsed(sw, now)
  const centis = Math.floor((elapsed % 1000) / 10)

  return (
    <div className="tm-sw">
      <div className="tm-sw-clock">
        {formatClock(elapsed, false)}
        <span className="tm-sw-centis">.{String(centis).padStart(2, '0')}</span>
      </div>
      <div className="tm-sw-actions">
        <button className="btn btn-primary" onClick={() => call('stopwatch', running ? 'pause' : 'start')}>
          {running ? <Pause size={14} /> : <Play size={14} />}
          {running ? 'Pause' : elapsed ? 'Resume' : 'Start'}
        </button>
        <button className="btn" disabled={!running} onClick={() => call('stopwatch', 'lap')}>
          <Flag size={14} /> Lap
        </button>
        <button className="btn" disabled={!elapsed} onClick={() => call('stopwatch', 'reset')}>
          Reset
        </button>
      </div>
      <ol className="tm-laps">
        {sw.laps
          .map((total, i) => [i + 1, total - (sw.laps[i - 1] ?? 0), total] as const)
          .reverse()
          .map(([n, split, total]) => (
            <li key={n}>
              <span className="muted">Lap {n}</span>
              <span>{formatClock(split, false)}</span>
              <span className="muted">{formatClock(total, false)}</span>
            </li>
          ))}
      </ol>
    </div>
  )
}
