import type { Countdown } from '@shared/countdown'

export type FocusPhase = 'idle' | 'focus' | 'break'

export interface FocusState {
  phase: FocusPhase
  /** The current focus or break; null when idle. */
  countdown: Countdown | null
  focusMin: number
  breakMin: number
  /** Focus sessions finished on `day`. */
  completedToday: number
  /** Local date (YYYY-MM-DD) that completedToday counts for. */
  day: string
}

export const FOCUS_LIMITS = { focusMin: [5, 120], breakMin: [1, 60] } as const

export const PHASE_LABEL: Record<FocusPhase, string> = {
  idle: 'Ready',
  focus: 'Focusing',
  break: 'On break'
}
