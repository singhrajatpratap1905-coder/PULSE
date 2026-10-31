import type { Countdown } from '@shared/countdown'

export interface TimerItem extends Countdown {
  id: string
  label: string
  createdAt: number
  /** Finished and not yet restarted or dismissed. */
  done: boolean
}

export interface Stopwatch {
  /** Set while running. */
  startedAt: number | null
  /** Time accumulated before the current run. */
  elapsedMs: number
  /** Total elapsed time at each lap, oldest first. */
  laps: number[]
}

export interface TimersState {
  timers: TimerItem[]
  stopwatch: Stopwatch
}

export type StopwatchAction = 'start' | 'pause' | 'lap' | 'reset'

export const stopwatchElapsed = (sw: Stopwatch, now = Date.now()): number =>
  sw.elapsedMs + (sw.startedAt !== null ? now - sw.startedAt : 0)

export const timerName = (t: Pick<TimerItem, 'label' | 'durationMs'>, span: (ms: number) => string): string =>
  t.label.trim() || `${span(t.durationMs)} timer`
