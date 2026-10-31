import { app, powerMonitor } from 'electron'
import { basename } from 'path'
import koffi from 'koffi'
import { defineService } from '@shared/widget'
import { friendlyAppName } from '@main/platform/apps'
import { processPathOfWindow, win32 } from '@main/platform/win32'
import { liveDemand } from '@main/widgets/live'
import type { ScreenTimeState } from './types'

const TICK_MS = 2000
// No keyboard or mouse input for this long counts as away.
const IDLE_SEC = 120
const KEEP_DAYS = 30
const SAVE_EVERY_MS = 15_000
const EMIT_EVERY_MS = 5_000

// The lock and sign-in screens own the foreground while the PC is locked. Lock events alone
// aren't enough: Pulse may start while the PC is already locked and never see one.
const NOT_USE = new Set(['lockapp.exe', 'logonui.exe'])

interface AppRecord {
  name: string
  path: string
  seconds: number
}

/** date → exe key → usage */
type Days = Record<string, Record<string, AppRecord>>

const dateKey = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default defineService((ctx) => {
  let days = ctx.store.get<Days>('days', {})
  let paused = ctx.store.get('paused', false)
  let locked = false
  let lastTick = Date.now()
  let lastSave = Date.now()
  let lastEmit = 0

  const icons = new Map<string, string>()
  const loading = new Set<string>()

  const loadIcon = (key: string, path: string): void => {
    if (icons.has(key) || loading.has(key)) return
    loading.add(key)
    app
      .getFileIcon(path, { size: 'normal' })
      .then((img) => {
        if (!img.isEmpty()) icons.set(key, img.toDataURL())
        ctx.emit('state', state())
      })
      .catch(() => {})
      .finally(() => loading.delete(key))
  }

  const state = (): ScreenTimeState => {
    const today = dateKey()
    const apps = Object.entries(days[today] ?? {})
      .map(([key, r]) => {
        loadIcon(key, r.path)
        return { key, name: r.name, seconds: Math.round(r.seconds), icon: icons.get(key) }
      })
      .sort((a, b) => b.seconds - a.seconds)

    const week = Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (6 - i))
      const date = dateKey(d)
      const seconds = Object.values(days[date] ?? {}).reduce((sum, r) => sum + r.seconds, 0)
      return { date, seconds: Math.round(seconds) }
    })

    return {
      today: { date: today, seconds: week[6].seconds, apps },
      week,
      paused
    }
  }

  const save = (): void => {
    // Keep a month of history.
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - KEEP_DAYS)
    const oldest = dateKey(cutoff)
    days = Object.fromEntries(Object.entries(days).filter(([date]) => date >= oldest))
    ctx.store.set('days', days)
    lastSave = Date.now()
  }

  const tick = (): void => {
    const now = Date.now()
    // Cap the step so a sleep/resume gap is never counted as use.
    const elapsed = Math.min(now - lastTick, 5000) / 1000
    lastTick = now

    if (!paused && !locked && powerMonitor.getSystemIdleTime() < IDLE_SEC) {
      const path = foregroundPath()
      const ownApp = path === process.execPath
      const key = path && (ownApp ? 'pulse' : basename(path).toLowerCase())
      if (path && key && !NOT_USE.has(key)) {
        const today = (days[dateKey()] ??= {})
        const record = (today[key] ??= { name: ownApp ? 'Pulse' : friendlyAppName(path), path, seconds: 0 })
        record.seconds += elapsed
      }
    }

    if (now - lastSave >= SAVE_EVERY_MS) save()
    // Only send fresh totals while the card or page is on screen.
    if (demand.interval() !== null && now - lastEmit >= EMIT_EVERY_MS) {
      lastEmit = now
      ctx.emit('state', state())
    }
  }

  // The window in front rarely changes between ticks; only look up its app when it does.
  let lastHwnd: bigint | null = null
  let lastPath: string | null = null
  const foregroundPath = (): string | null => {
    const w = win32()
    if (!w) return null
    const hwnd = w.GetForegroundWindow()
    const address = hwnd ? koffi.address(hwnd) : null
    if (address !== lastHwnd) {
      lastHwnd = address
      lastPath = hwnd ? processPathOfWindow(hwnd) : null
    }
    return lastPath
  }

  const demand = liveDemand()
  ctx.handle('watch', (intervalMs: number) => demand.watch(intervalMs))

  const onLock = (): void => {
    locked = true
  }
  const onUnlock = (): void => {
    locked = false
  }
  powerMonitor.on('lock-screen', onLock)
  powerMonitor.on('unlock-screen', onUnlock)
  const timer = setInterval(tick, TICK_MS)

  ctx.handle('getState', state)

  ctx.handle('setPaused', (next: boolean) => {
    paused = !!next
    ctx.store.set('paused', paused)
    ctx.emit('state', state())
  })

  ctx.handle('clear', () => {
    days = {}
    save()
    ctx.emit('state', state())
  })

  return () => {
    clearInterval(timer)
    powerMonitor.off('lock-screen', onLock)
    powerMonitor.off('unlock-screen', onUnlock)
    save()
  }
})
