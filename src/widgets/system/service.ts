import { cpus, freemem, totalmem, uptime } from 'os'
import { statfsSync } from 'fs'
import { defineService } from '@shared/widget'
import { powerStatus } from '@main/platform/win32'
import { liveDemand } from '@main/widgets/live'
import type { SystemStats } from './types'

// With nobody watching, only the battery is checked (for plug/low alerts), this often.
const UNWATCHED_MS = 60_000
const LOW_BATTERY = 20
const CRITICAL_BATTERY = 10

/** Total and idle CPU time across all cores since boot. */
function cpuTimes(): { idle: number; total: number } {
  let idle = 0
  let total = 0
  for (const { times } of cpus()) {
    idle += times.idle
    total += times.user + times.nice + times.sys + times.idle + times.irq
  }
  return { idle, total }
}

function diskUsage(): SystemStats['disk'] {
  const drive = `${process.env.SystemDrive ?? 'C:'}\\`
  try {
    const fs = statfsSync(drive)
    const total = fs.blocks * fs.bsize
    return { drive, total, used: total - fs.bavail * fs.bsize }
  } catch {
    return null
  }
}

export default defineService((ctx) => {
  const info = cpus()
  let prev = cpuTimes()
  let stats: SystemStats = {
    cpu: 0,
    memory: { used: totalmem() - freemem(), total: totalmem() },
    disk: diskUsage(),
    battery: null,
    uptimeSec: uptime(),
    cpuModel: info[0]?.model.trim() ?? 'Unknown CPU',
    cores: info.length
  }

  // Battery messages fire on changes only, and each warning once per discharge.
  let lastPlugged: boolean | null = null
  let warned: 'none' | 'low' | 'critical' = 'none'

  const watchBattery = (battery: SystemStats['battery']): void => {
    if (!battery) return
    const { percent, pluggedIn } = battery
    if (lastPlugged !== null && pluggedIn !== lastPlugged) {
      ctx.activity({
        title: pluggedIn ? 'Charging' : 'On battery',
        detail: `${percent}%`,
        tone: pluggedIn ? 'success' : 'neutral',
        key: 'power'
      })
    }
    lastPlugged = pluggedIn

    if (pluggedIn || percent > LOW_BATTERY + 5) {
      warned = 'none'
      return
    }
    const level = percent <= CRITICAL_BATTERY ? 'critical' : percent <= LOW_BATTERY ? 'low' : 'none'
    if (level === 'none' || level === warned || (warned === 'critical' && level === 'low')) return
    warned = level
    ctx.activity({
      title: level === 'critical' ? 'Battery critical' : 'Battery low',
      detail: `${percent}%`,
      tone: level === 'critical' ? 'danger' : 'warning',
      durationMs: 6000,
      important: true,
      key: 'battery-low'
    })
    ctx.notify({ title: level === 'critical' ? 'Battery critical' : 'Battery low', body: `${percent}% left. Plug in soon.` })
  }

  const readBattery = (): SystemStats['battery'] => {
    const power = powerStatus()
    return power && power.percent !== null
      ? { percent: power.percent, pluggedIn: power.pluggedIn, minutesLeft: power.minutesLeft }
      : null
  }

  /** Everything, for when the System card or page is on screen. */
  const sampleAll = (): void => {
    const now = cpuTimes()
    const total = now.total - prev.total
    const busy = total - (now.idle - prev.idle)
    prev = now
    stats = {
      ...stats,
      cpu: total > 0 ? Math.round((busy / total) * 1000) / 10 : 0,
      memory: { used: totalmem() - freemem(), total: totalmem() },
      disk: diskUsage(),
      battery: readBattery(),
      uptimeSec: uptime()
    }
    watchBattery(stats.battery)
    ctx.emit('stats', stats)
  }

  // Full stats only while someone is looking; otherwise just keep an eye on the battery.
  const demand = liveDemand()
  let timer: NodeJS.Timeout | undefined
  const loop = (): void => {
    const interval = demand.interval()
    if (interval) sampleAll()
    else watchBattery(readBattery())
    timer = setTimeout(loop, interval ?? UNWATCHED_MS)
  }
  loop()

  ctx.handle('getStats', () => {
    // A fresh reading for whoever just opened the card or page.
    sampleAll()
    return stats
  })

  ctx.handle('watch', (intervalMs: number) => {
    const wasIdle = demand.interval() === null
    demand.watch(intervalMs)
    if (wasIdle) {
      clearTimeout(timer)
      timer = setTimeout(loop, intervalMs)
    }
  })

  return () => clearTimeout(timer)
})
