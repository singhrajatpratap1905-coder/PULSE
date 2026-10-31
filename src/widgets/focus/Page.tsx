import { Minus, Pause, Play, Plus, SkipForward, Square } from 'lucide-react'
import { useWidget, useWidgetValue } from '@renderer/widgets/sdk'
import { useNow } from '@renderer/lib/format'
import { formatClock, isRunning, progress, remainingMs } from '@shared/countdown'
import { PHASE_LABEL, type FocusState } from './types'

export const ID = 'focus'

const INITIAL: FocusState = {
  phase: 'idle',
  countdown: null,
  focusMin: 25,
  breakMin: 5,
  completedToday: 0,
  day: ''
}

export function useFocus(): { state: FocusState; now: number; running: boolean; leftMs: number } {
  const state = useWidgetValue(ID, 'getState', 'state', INITIAL)
  const running = !!state.countdown && isRunning(state.countdown)
  const now = useNow(250, running)
  const leftMs = state.countdown ? remainingMs(state.countdown, now) : state.focusMin * 60_000
  return { state, now, running, leftMs }
}

export function statusText(state: FocusState, running: boolean): string {
  if (state.phase !== 'idle' && !running) return 'Paused'
  return PHASE_LABEL[state.phase]
}

const RING = 2 * Math.PI * 70

export function FocusPage(): JSX.Element {
  const { call } = useWidget(ID)
  const { state, now, running, leftMs } = useFocus()
  const done = state.countdown ? progress(state.countdown, now) : 0
  const idle = state.phase === 'idle'

  return (
    <div className="fc">
      <section className="fc-main">
        <div className={`fc-ring phase-${state.phase}`}>
          <svg viewBox="0 0 160 160">
            <circle className="fc-ring-track" cx="80" cy="80" r="70" />
            <circle
              className="fc-ring-fill"
              cx="80"
              cy="80"
              r="70"
              strokeDasharray={RING}
              strokeDashoffset={RING * (1 - done)}
            />
          </svg>
          <div className="fc-ring-text">
            <span className="fc-clock">{formatClock(leftMs)}</span>
            <span className="muted small">{statusText(state, running)}</span>
          </div>
        </div>

        <div className="fc-actions">
          <button
            className="btn btn-primary"
            onClick={() => call(running ? 'pause' : 'start')}
          >
            {running ? <Pause size={14} /> : <Play size={14} />}
            {running ? 'Pause' : idle ? `Start ${state.focusMin} min` : 'Resume'}
          </button>
          {!idle && (
            <>
              <button className="btn" onClick={() => call('skip')} title="End this phase early">
                <SkipForward size={14} /> {state.phase === 'focus' ? 'Break' : 'Skip'}
              </button>
              <button className="btn" onClick={() => call('stop')} title="Stop and reset">
                <Square size={13} />
              </button>
            </>
          )}
        </div>
      </section>

      <section className="fc-side">
        <span className="section-label">Today</span>
        <div className="fc-today">
          <span className="big-number">{state.completedToday}</span>
          <span className="muted small">
            {state.completedToday === 1 ? 'session' : 'sessions'} ·{' '}
            {state.completedToday * state.focusMin} min focused
          </span>
        </div>

        <span className="section-label">Lengths</span>
        <Stepper
          label="Focus"
          value={state.focusMin}
          step={5}
          onChange={(focusMin) => call('setDurations', { focusMin })}
        />
        <Stepper
          label="Break"
          value={state.breakMin}
          step={1}
          onChange={(breakMin) => call('setDurations', { breakMin })}
        />
        <p className="muted small fc-hint">New lengths apply from the next session.</p>
      </section>
    </div>
  )
}

function Stepper({
  label,
  value,
  step,
  onChange
}: {
  label: string
  value: number
  step: number
  onChange: (value: number) => void
}): JSX.Element {
  return (
    <div className="fc-stepper">
      <span>{label}</span>
      <div className="fc-stepper-controls">
        <button className="icon-btn" onClick={() => onChange(value - step)} title={`−${step} min`}>
          <Minus size={14} />
        </button>
        <span className="fc-stepper-value">{value} min</span>
        <button className="icon-btn" onClick={() => onChange(value + step)} title={`+${step} min`}>
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}
