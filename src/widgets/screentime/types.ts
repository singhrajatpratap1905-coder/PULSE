// Screen time: seconds per app per day, counted only while you're actually at the PC.
// Only app names are recorded, never window titles or what's on screen.

export interface AppUsage {
  /** Lower-case exe name, e.g. "code.exe". */
  key: string
  name: string
  seconds: number
  /** App icon as a data URL, once loaded. */
  icon?: string
}

export interface DayTotal {
  /** Local date, YYYY-MM-DD. */
  date: string
  seconds: number
}

export interface ScreenTimeState {
  today: { date: string; seconds: number; apps: AppUsage[] }
  /** The last 7 days, oldest first, today last. */
  week: DayTotal[]
  paused: boolean
}

/** "4h 24m", "37m", "under a minute". */
export function formatUsage(seconds: number): string {
  const m = Math.floor(seconds / 60)
  if (m < 1) return seconds > 0 ? '<1m' : '0m'
  const h = Math.floor(m / 60)
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`
}
