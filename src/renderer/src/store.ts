import { create } from 'zustand'
import type { OpenSource, Settings } from '@shared/types'
import type { Activity, MascotPrefs } from '@shared/widget'
import { api } from './api'

// Older activities are dropped beyond this so a burst never turns into a long backlog.
const MAX_QUEUED = 4

interface PulseState {
  expanded: boolean
  source: OpenSource | null
  activeTab: string
  settings: Settings | null
  /** The activity the collapsed notch is showing, if any. */
  activity: Activity | null
  queue: Activity[]
  /** Something is being dragged out of the panel. */
  dragging: boolean
  /** Files from another app are being dragged over the notch. */
  fileDragOver: boolean
  /** Boo the mascot's settings, from the mascot service. */
  mascot: MascotPrefs | null
  open: (source: OpenSource) => void
  /** Turn a hover peek into a panel that stays open (after a click inside it). */
  pin: () => void
  close: () => void
  setTab: (id: string) => void
  setSettings: (settings: Settings) => void
  pushActivity: (activity: Activity) => void
  nextActivity: () => void
}

const sameKey = (a: Activity, b: Activity): boolean =>
  !!a.key && a.key === b.key && a.widgetId === b.widgetId

export const usePulse = create<PulseState>((set, get) => ({
  expanded: false,
  source: null,
  activeTab: 'home',
  settings: null,
  activity: null,
  queue: [],
  mascot: null,
  dragging: false,
  fileDragOver: false,
  open: (source) => {
    const { expanded, activity, queue } = get()
    if (expanded) return
    // Opening the panel supersedes what the notch was saying, except important messages,
    // which wait until it closes again.
    const keep = [activity, ...queue].filter((a): a is Activity => !!a?.important)
    set({ expanded: true, source, activity: null, queue: keep })
    api.setExpanded(true, source !== 'hover')
  },
  pin: () => {
    if (get().source === 'hover') set({ source: 'click' })
  },
  close: () => {
    if (!get().expanded) return
    // A field left focused would make the next opening scroll back to it (see App.tsx).
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    set({ expanded: false, source: null })
    api.setExpanded(false, false)
    if (!get().activity && get().queue.length) get().nextActivity()
  },
  setTab: (activeTab) => set({ activeTab }),
  setSettings: (settings) => set({ settings }),
  pushActivity: (incoming) => {
    const { expanded, activity, queue, mascot } = get()
    if (incoming.scene) {
      api.log(
        `scene "${incoming.scene}" arrived: panel ${expanded ? 'open (waits)' : 'closed'}, ` +
          `mascot ${mascot ? (mascot.enabled ? 'on' : 'off') : 'settings not loaded'}, ` +
          `${activity ? 'queued behind another message' : 'showing now'}`
      )
    }
    if (expanded) {
      if (incoming.important) set({ queue: [...queue, incoming].slice(-MAX_QUEUED) })
      return
    }
    if (!activity) return set({ activity: incoming })
    if (sameKey(activity, incoming)) return set({ activity: incoming })
    const rest = queue.filter((q) => !sameKey(q, incoming))
    set({ queue: [...rest, incoming].slice(-MAX_QUEUED) })
  },
  nextActivity: () => {
    const [next = null, ...rest] = get().queue
    set({ activity: next, queue: rest })
  }
}))
