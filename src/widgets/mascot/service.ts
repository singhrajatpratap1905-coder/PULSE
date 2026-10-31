import { powerMonitor } from 'electron'
import { userInfo } from 'os'
import { defineService, type ActivityInput, type MascotPrefs, type MascotScene } from '@shared/widget'

const CHECK_MS = 30_000
// "At the PC" means some keyboard or mouse input within this long.
const ACTIVE_WITHIN_SEC = 30

type DayPart = 'morning' | 'afternoon' | 'evening'

function dayPart(hour: number): DayPart | null {
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 22) return 'evening'
  return null
}

const dateKey = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function defaultName(): string {
  try {
    const name = userInfo().username.split(/[._\s-]/)[0]
    return name ? name[0].toUpperCase() + name.slice(1) : ''
  } catch {
    return ''
  }
}

// Sample messages for the Settings preview buttons.
const PREVIEWS: Record<MascotScene, Omit<ActivityInput, 'scene'>> = {
  wave: { title: 'Good morning!', moment: 'greetings' },
  typing: { title: 'Focus time', detail: '25 min', moment: 'focus' },
  coffee: { title: 'Break time', detail: '5 min · nice work!', moment: 'focus' },
  celebrate: { title: 'Timer done', detail: 'Tea', moment: 'celebrations' },
  catch: { title: 'Copied', detail: 'Text' },
  sleepy: { title: "It's getting late", detail: 'Maybe call it a night?', moment: 'bedtime' }
}

export default defineService((ctx) => {
  let prefs = ctx.store.get<MascotPrefs>('prefs', {
    enabled: true,
    name: defaultName(),
    moments: { greetings: true, focus: true, celebrations: true, bedtime: true },
    notch: true
  })

  const greet = (part: DayPart): string => {
    const name = prefs.name.trim()
    return `Good ${part}${name ? `, ${name}` : ''}!`
  }

  /** Greets once per part of the day, and nudges once per night, the first time you're at the PC. */
  const check = (): void => {
    if (!prefs.enabled || powerMonitor.getSystemIdleTime() > ACTIVE_WITHIN_SEC) return
    const now = new Date()
    const hour = now.getHours()

    const part = dayPart(hour)
    const greetKey = part && `${dateKey(now)}-${part}`
    if (part && prefs.moments.greetings && ctx.store.get('lastGreeting', '') !== greetKey) {
      ctx.store.set('lastGreeting', greetKey)
      ctx.activity({ title: greet(part), scene: 'wave', moment: 'greetings', important: true })
    }

    if (hour < 4 && prefs.moments.bedtime && ctx.store.get('lastBedtime', '') !== dateKey(now)) {
      ctx.store.set('lastBedtime', dateKey(now))
      ctx.activity({
        title: "It's getting late",
        detail: 'Maybe call it a night?',
        scene: 'sleepy',
        moment: 'bedtime',
        durationMs: 6000,
        important: true
      })
    }
  }

  // Give the UI a moment to load on startup, then check regularly and on return to the PC.
  const startTimer = setTimeout(check, 5000)
  const timer = setInterval(check, CHECK_MS)
  const onBack = (): void => {
    setTimeout(check, 3000)
  }
  powerMonitor.on('unlock-screen', onBack)
  powerMonitor.on('resume', onBack)

  ctx.handle('getPrefs', () => prefs)

  ctx.handle('setPrefs', (patch: Partial<MascotPrefs>) => {
    prefs = {
      ...prefs,
      ...patch,
      name: String(patch.name ?? prefs.name).slice(0, 30),
      moments: { ...prefs.moments, ...(patch.moments ?? {}) }
    }
    ctx.store.set('prefs', prefs)
    ctx.emit('prefs', prefs)
    return prefs
  })

  /** Plays a scene now, for trying them out from Settings. */
  ctx.handle('preview', (scene: MascotScene) => {
    const sample = PREVIEWS[scene]
    if (!sample) return
    const title = scene === 'wave' ? greet(dayPart(new Date().getHours()) ?? 'evening') : sample.title
    ctx.activity({ ...sample, title, scene, important: true })
  })

  return () => {
    clearTimeout(startTimer)
    clearInterval(timer)
    powerMonitor.off('unlock-screen', onBack)
    powerMonitor.off('resume', onBack)
  }
})
