import { cpus, freemem, totalmem, uptime } from 'os'
import { statfsSync } from 'fs'
import { defineService } from '@shared/widget'
import { powerStatus } from '@main/platform/win32'
import type { SystemStats } from './types'

const SAMPLE_MS = 2000
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

  const sample = (): void => {
    const now = cpuTimes()
    const total = now.total - prev.total
    const busy = total - (now.idle - prev.idle)
    prev = now
    const power = powerStatus()
    stats = {
      ...stats,
      cpu: total > 0 ? Math.round((busy / total) * 1000) / 10 : 0,
      memory: { used: totalmem() - freemem(), total: totalmem() },
      disk: diskUsage(),
      battery:
        power && power.percent !== null
          ? { percent: power.percent, pluggedIn: power.pluggedIn, minutesLeft: power.minutesLeft }
          : null,
      uptimeSec: uptime()
    }
    watchBattery(stats.battery)
    ctx.emit('stats', stats)
  }

  sample()
  const timer = setInterval(sample, SAMPLE_MS)

  ctx.handle('getStats', () => stats)

  return () => clearInterval(timer)
})
