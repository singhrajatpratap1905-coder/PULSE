import { powerMonitor } from 'electron'
import { randomUUID } from 'crypto'
import { defineService } from '@shared/widget'
import {
  createCountdown,
  formatSpan,
  isDue,
  isRunning,
  MAX_DURATION_MS,
  pauseCountdown,
  resetCountdown,
  startCountdown
} from '@shared/countdown'
import { stopwatchElapsed, timerName, type StopwatchAction, type TimerItem, type TimersState } from './types'

const MAX_TIMERS = 20
// How often running timers are checked; also how late a finish can be noticed.
const CHECK_MS = 250

const EMPTY: TimersState = { timers: [], stopwatch: { startedAt: null, elapsedMs: 0, laps: [] } }

export default defineService((ctx) => {
  let state = ctx.store.get<TimersState>('state', EMPTY)
  let ticker: NodeJS.Timeout | undefined

  const commit = (next: TimersState): void => {
    state = next
    ctx.store.set('state', state)
    ctx.emit('state', state)
    schedule()
  }

  const updateTimer = (id: string, fn: (t: TimerItem) => TimerItem): void =>
    commit({ ...state, timers: state.timers.map((t) => (t.id === id ? fn(t) : t)) })

  // Only tick while something can finish.
  const schedule = (): void => {
    const running = state.timers.some(isRunning)
    if (running && !ticker) ticker = setInterval(check, CHECK_MS)
    if (!running && ticker) {
      clearInterval(ticker)
      ticker = undefined
    }
  }

  const check = (): void => {
    const now = Date.now()
    const due = state.timers.filter((t) => isDue(t, now))
    if (!due.length) return
    commit({
      ...state,
      timers: state.timers.map((t) =>
        isDue(t, now) ? { ...t, endsAt: null, remainingMs: 0, done: true } : t
      )
    })
    for (const t of due) {
      const name = timerName(t, formatSpan)
      ctx.activity({
        title: 'Timer done',
        detail: name,
        tone: 'success',
        durationMs: 6000,
        important: true,
        scene: 'celebrate',
        moment: 'celebrations'
      })
      ctx.notify({ title: 'Timer done', body: name })
    }
  }

  // Timers that ended while the PC slept or Pulse was closed finish right away.
  powerMonitor.on('resume', check)
  check()
  schedule()

  ctx.handle('getState', () => state)

  ctx.handle('add', ({ durationMs, label = '' }: { durationMs: number; label?: string }) => {
    if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_DURATION_MS) {
      throw new Error('Timer length must be between 1 second and 24 hours')
    }
    const timer: TimerItem = {
      ...startCountdown(createCountdown(Math.round(durationMs))),
      id: randomUUID(),
      label: String(label).slice(0, 60),
      createdAt: Date.now(),
      done: false
    }
    commit({ ...state, timers: [timer, ...state.timers].slice(0, MAX_TIMERS) })
    return timer.id
  })

  ctx.handle('toggle', (id: string) =>
    updateTimer(id, (t) => {
      if (t.done) return { ...t, ...startCountdown(resetCountdown(t)), done: false }
      return isRunning(t) ? { ...t, ...pauseCountdown(t) } : { ...t, ...startCountdown(t) }
    })
  )

  ctx.handle('restart', (id: string) =>
    updateTimer(id, (t) => ({ ...t, ...startCountdown(resetCountdown(t)), done: false }))
  )

  ctx.handle('remove', (id: string) =>
    commit({ ...state, timers: state.timers.filter((t) => t.id !== id) })
  )

  ctx.handle('clearDone', () => commit({ ...state, timers: state.timers.filter((t) => !t.done) }))

  ctx.handle('stopwatch', (action: StopwatchAction) => {
    const sw = state.stopwatch
    const now = Date.now()
    const next = {
      start: () => (sw.startedAt !== null ? sw : { ...sw, startedAt: now }),
      pause: () =>
        sw.startedAt === null ? sw : { ...sw, elapsedMs: stopwatchElapsed(sw, now), startedAt: null },
      lap: () => (sw.startedAt === null ? sw : { ...sw, laps: [...sw.laps, stopwatchElapsed(sw, now)].slice(-99) }),
      reset: () => EMPTY.stopwatch
    }[action]
    if (next) commit({ ...state, stopwatch: next() })
  })

  return () => {
    clearInterval(ticker)
    powerMonitor.off('resume', check)
  }
})
