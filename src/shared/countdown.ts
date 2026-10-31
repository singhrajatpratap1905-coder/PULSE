// A pausable countdown, stored as plain data so it survives restarts.
// Running means `endsAt` is set; paused or stopped means `remainingMs` holds the time left.

export interface Countdown {
  durationMs: number
  remainingMs: number
  endsAt: number | null
}

export const MAX_DURATION_MS = 24 * 3_600_000

export const createCountdown = (durationMs: number): Countdown => ({
  durationMs,
  remainingMs: durationMs,
  endsAt: null
})

export const isRunning = (c: Countdown): boolean => c.endsAt !== null

export const remainingMs = (c: Countdown, now = Date.now()): number =>
  c.endsAt === null ? c.remainingMs : Math.max(0, c.endsAt - now)

export const startCountdown = (c: Countdown, now = Date.now()): Countdown =>
  c.endsAt !== null || c.remainingMs <= 0 ? c : { ...c, endsAt: now + c.remainingMs }

export const pauseCountdown = (c: Countdown, now = Date.now()): Countdown =>
  c.endsAt === null ? c : { ...c, remainingMs: remainingMs(c, now), endsAt: null }

export const resetCountdown = (c: Countdown): Countdown => createCountdown(c.durationMs)

export const isDue = (c: Countdown, now = Date.now()): boolean => c.endsAt !== null && c.endsAt <= now

/** 0 at the start, 1 when finished. */
export const progress = (c: Countdown, now = Date.now()): number =>
  c.durationMs > 0 ? 1 - remainingMs(c, now) / c.durationMs : 1

/** "4:05", "1:02:03". Rounds up so a countdown shows 0:00 only when it's actually done. */
export function formatClock(ms: number, roundUp = true): string {
  const total = roundUp ? Math.ceil(ms / 1000) : Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** "25 min", "1 h 30 min", "45 s". */
export function formatSpan(ms: number): string {
  const total = Math.round(ms / 1000)
  if (total < 60) return `${total} s`
  const h = Math.floor(total / 3600)
  const m = Math.round((total % 3600) / 60)
  if (h === 0) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}

/**
 * Parses what people type for a timer: "5" (minutes), "90s", "1h30m", "1.5h", "10:00", "1:05:00".
 * Returns null for anything unparseable, zero, or longer than a day.
 */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase()
  if (!text) return null
  let ms: number | null = null

  if (/^\d+(\.\d+)?$/.test(text)) {
    ms = parseFloat(text) * 60_000
  } else if (/^\d+(:\d{1,2}){1,2}$/.test(text)) {
    const parts = text.split(':').map(Number)
    if (parts.slice(1).some((p) => p >= 60)) return null
    const [h, m, s] = parts.length === 3 ? parts : [0, ...parts]
    ms = ((h * 60 + m) * 60 + s) * 1000
  } else {
    const units: Record<string, number> = { h: 3_600_000, m: 60_000, s: 1000 }
    const re = /(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?|s|sec|secs|seconds?)/g
    let consumed = ''
    let sum = 0
    for (const match of text.matchAll(re)) {
      sum += parseFloat(match[1]) * units[match[2][0]]
      consumed += match[0]
    }
    if (consumed.replace(/\s/g, '') !== text.replace(/\s/g, '')) return null
    ms = sum
  }

  ms = Math.round(ms)
  return ms > 0 && ms <= MAX_DURATION_MS ? ms : null
}
