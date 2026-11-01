import { powerMonitor } from 'electron'
import { userInfo } from 'os'
import { defineService, type ActivityInput, type MascotMoment, type MascotPrefs, type MascotScene } from '@shared/widget'
import { nowPlaying } from '@main/platform/media'

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
  sleepy: { title: "It's getting late", detail: 'Maybe call it a night?', moment: 'bedtime' },
  music: { title: 'Blinding Lights', detail: 'The Weeknd', moment: 'music' }
}

// How often to ask Windows what's playing. Cheap: a few COM calls.
const MUSIC_POLL_MS = 2000
const SONG_DURATION_MS = 4500

const DEFAULT_MOMENTS: Record<MascotMoment, boolean> = {
  greetings: true,
  focus: true,
  celebrations: true,
  bedtime: true,
  music: true
}

export default defineService((ctx) => {
  const saved = ctx.store.get<MascotPrefs>('prefs', {
    enabled: true,
    name: defaultName(),
    moments: DEFAULT_MOMENTS,
    notch: true
  })
  // Moments added in later versions start out on.
  let prefs: MascotPrefs = { ...saved, moments: { ...DEFAULT_MOMENTS, ...saved.moments } }

  // Boo puts on headphones while music plays, and the notch shows each new song briefly.
  let vibing = false
  let lastSong = ''
  let polling = false
  let warned = false
  const setVibing = (on: boolean): void => {
    if (on === vibing) return
    vibing = on
    ctx.emit('vibing', on)
  }
  const pollMusic = async (): Promise<void> => {
    if (polling) return
    if (!prefs.enabled || !prefs.moments.music) return setVibing(false)
    polling = true
    try {
      const now = await nowPlaying()
      setVibing(!!now?.playing)
      if (!now?.playing || !now.title) return
      const song = `${now.title}\n${now.artist}`
      if (song === lastSong) return
      lastSong = song
      ctx.activity({
        title: now.title,
        detail: now.artist || undefined,
        scene: 'music',
        moment: 'music',
        key: 'music',
        durationMs: SONG_DURATION_MS
      })
    } catch (err) {
      // Said once: this runs every couple of seconds.
      if (!warned) console.warn('[pulse] could not read what is playing:', err)
      warned = true
      setVibing(false)
    } finally {
      polling = false
    }
  }
  const musicTimer = setInterval(pollMusic, MUSIC_POLL_MS)
  ctx.handle('getVibing', () => vibing)

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
    clearInterval(musicTimer)
    powerMonitor.off('unlock-screen', onBack)
    powerMonitor.off('resume', onBack)
  }
})
