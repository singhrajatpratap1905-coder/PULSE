import { powerMonitor } from 'electron'
import { defineService } from '@shared/widget'
import {
  createCountdown,
  isDue,
  isRunning,
  pauseCountdown,
  startCountdown
} from '@shared/countdown'
import { FOCUS_LIMITS, type FocusState } from './types'

const CHECK_MS = 250

const today = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const clamp = (n: number, [min, max]: readonly [number, number]): number =>
  Math.min(max, Math.max(min, Math.round(n)))

export default defineService((ctx) => {
  let state = ctx.store.get<FocusState>('state', {
    phase: 'idle',
    countdown: null,
    focusMin: 25,
    breakMin: 5,
    completedToday: 0,
    day: today()
  })
  let ticker: NodeJS.Timeout | undefined

  const commit = (patch: Partial<FocusState>): void => {
    state = { ...state, ...patch }
    // The daily count starts over at midnight.
    if (state.day !== today()) state = { ...state, day: today(), completedToday: 0 }
    ctx.store.set('state', state)
    ctx.emit('state', state)
    const running = !!state.countdown && isRunning(state.countdown)
    if (running && !ticker) ticker = setInterval(check, CHECK_MS)
    if (!running && ticker) {
      clearInterval(ticker)
      ticker = undefined
    }
  }

  const begin = (phase: 'focus' | 'break'): void => {
    const minutes = phase === 'focus' ? state.focusMin : state.breakMin
    commit({ phase, countdown: startCountdown(createCountdown(minutes * 60_000)) })
  }

  const check = (): void => {
    if (!state.countdown || !isDue(state.countdown)) return
    const overdueMs = Date.now() - (state.countdown.endsAt ?? Date.now())

    // Finished long ago (PC asleep, Pulse closed): settle quietly instead of alerting late.
    const breakMs = state.breakMin * 60_000
    if (state.phase === 'focus' && overdueMs > breakMs) {
      return commit({ phase: 'idle', countdown: null, completedToday: state.completedToday + 1 })
    }
    if (state.phase === 'break' && overdueMs > 60_000) {
      return commit({ phase: 'idle', countdown: null })
    }

    if (state.phase === 'focus') {
      commit({ completedToday: state.completedToday + 1 })
      ctx.activity({
        title: 'Break time',
        detail: `${state.breakMin} min · nice work!`,
        tone: 'success',
        durationMs: 6000,
        important: true,
        scene: 'coffee',
        moment: 'focus'
      })
      ctx.notify({ title: 'Focus session done', body: `Take a ${state.breakMin} minute break.` })
      begin('break')
    } else {
      commit({ phase: 'idle', countdown: null })
      ctx.activity({
        title: 'Break over',
        detail: 'Ready for another round?',
        durationMs: 5000,
        important: true,
        scene: 'wave',
        moment: 'focus'
      })
      ctx.notify({ title: 'Break over', body: 'Ready for another focus session?' })
    }
  }

  powerMonitor.on('resume', check)
  commit({})
  check()

  ctx.handle('getState', () => state)

  /** Starts a focus session from idle, or resumes a paused one. */
  ctx.handle('start', () => {
    if (state.phase === 'idle' || !state.countdown) {
      begin('focus')
      // Usually started from the open panel, so it plays once the panel closes.
      ctx.activity({
        title: 'Focus time',
        detail: `${state.focusMin} min`,
        important: true,
        scene: 'typing',
        moment: 'focus'
      })
      return
    }
    commit({ countdown: startCountdown(state.countdown) })
  })

  ctx.handle('pause', () => {
    if (state.countdown) commit({ countdown: pauseCountdown(state.countdown) })
  })

  ctx.handle('stop', () => commit({ phase: 'idle', countdown: null }))

  /** Ends the current phase early without counting it: focus goes to break, break to idle. */
  ctx.handle('skip', () => {
    if (state.phase === 'focus') begin('break')
    else commit({ phase: 'idle', countdown: null })
  })

  ctx.handle('setDurations', ({ focusMin, breakMin }: { focusMin?: number; breakMin?: number }) =>
    commit({
      focusMin: focusMin === undefined ? state.focusMin : clamp(focusMin, FOCUS_LIMITS.focusMin),
      breakMin: breakMin === undefined ? state.breakMin : clamp(breakMin, FOCUS_LIMITS.breakMin)
    })
  )

  return () => {
    clearInterval(ticker)
    powerMonitor.off('resume', check)
  }
})
