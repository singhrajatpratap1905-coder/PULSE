import { useEffect } from 'react'
import type { MascotPrefs } from '@shared/widget'
import { api } from './api'
import { usePulse } from './store'
import { Notch } from './Notch'

export function App(): JSX.Element {
  useEffect(() => {
    const { setSettings } = usePulse.getState()
    api.getSettings().then(setSettings)

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') usePulse.getState().close()
    }
    window.addEventListener('keydown', onKey)

    // Files dropped outside a drop target are ignored rather than opened by the browser.
    const swallow = (e: DragEvent): void => e.preventDefault()
    window.addEventListener('dragover', swallow)
    window.addEventListener('drop', swallow)

    const offToggle = api.onToggle(() => {
      const { expanded, open, close } = usePulse.getState()
      if (expanded) close()
      else open('shortcut')
    })

    // Clicking another app closes a pinned panel; a hover peek closes on pointer leave instead.
    const offBlur = api.onBlur(() => {
      const { source, close } = usePulse.getState()
      if (source && source !== 'hover') close()
    })

    // Let go of text-field focus when the window loses it. Otherwise, the next click that
    // activates the window makes the browser scroll back to that field mid-click, and the
    // click lands on whatever moved under the pointer.
    const dropFocus = (): void => (document.activeElement as HTMLElement | null)?.blur?.()
    window.addEventListener('blur', dropFocus)

    // Trace presses in Settings, where clicks were going missing on one PC.
    const trace = (e: Event): void => {
      if (usePulse.getState().activeTab !== 'settings') return
      const t = e.target as HTMLElement
      const scroll = Math.round(document.querySelector('.panel-body')?.scrollTop ?? 0)
      api.log(`${e.type} on ${t.tagName.toLowerCase()}.${t.className || '-'} "${(t.textContent ?? '').trim().slice(0, 20)}" (scroll ${scroll})`)
    }
    document.addEventListener('pointerdown', trace, true)
    document.addEventListener('click', trace, true)

    const offSettings = api.onSettings(setSettings)
    const offActivity = api.onActivity((a) => usePulse.getState().pushActivity(a))

    const setMascot = (mascot: unknown): void => usePulse.setState({ mascot: mascot as MascotPrefs })
    api.widgets
      .call('mascot', 'getPrefs')
      .then(setMascot, (err) => api.log(`couldn't load mascot settings: ${err}`))
    const offMascot = api.widgets.on('mascot', 'prefs', setMascot)
    api.ready()
    // The UI came up: tells the updater this version works (see loader/main.cjs).
    api.widgets.call('updater', 'healthy').catch(() => {})

    return () => {
      offActivity()
      offMascot()
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', dropFocus)
      document.removeEventListener('pointerdown', trace, true)
      document.removeEventListener('click', trace, true)
      window.removeEventListener('dragover', swallow)
      window.removeEventListener('drop', swallow)
      offToggle()
      offBlur()
      offSettings()
    }
  }, [])

  return (
    <div className="stage">
      <Notch />
    </div>
  )
}
