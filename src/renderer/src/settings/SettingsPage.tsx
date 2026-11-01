import { useEffect, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { FolderOpen, Play, Power, RefreshCw, X } from 'lucide-react'
import type { AppInfo, Settings } from '@shared/types'
import type { MascotMoment, MascotPrefs, MascotScene } from '@shared/widget'
import type { UpdateStatus } from '../../../widgets/updater/types'
import { api } from '../api'
import { usePulse } from '../store'
import { useWidget, useWidgetValue } from '../widgets/sdk'
import { relativeTime, useNow } from '../lib/format'
import { SceneArt } from '../mascot/Scene'
import './settings.css'

const HOVER_DELAYS: Array<[number, string]> = [
  [0, 'Instant'],
  [150, 'Quick'],
  [250, 'Normal'],
  [450, 'Relaxed']
]

export function SettingsPage(): JSX.Element {
  const settings = usePulse((s) => s.settings)
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    api.getAppInfo().then(setInfo)
  }, [settings])

  if (!settings || !info) return <div />

  const update = async (patch: Partial<Settings>): Promise<string | undefined> => {
    const result = await api.updateSettings(patch)
    setInfo(result.info)
    return result.error
  }

  return (
    <div className="st">
      <Section title="General">
        <Row label="Shortcut" hint="Opens Pulse from anywhere">
          <ShortcutField value={info.activeShortcut} onChange={(shortcut) => update({ shortcut })} />
        </Row>
        <Row label="Open on hover" hint="Rest the pointer on the notch to peek">
          <Switch on={settings.hoverToOpen} onChange={(hoverToOpen) => update({ hoverToOpen })} />
        </Row>
        <Row label="Hover delay">
          <div className={`segmented st-delays${settings.hoverToOpen ? '' : ' disabled'}`}>
            {HOVER_DELAYS.map(([ms, label]) => (
              <button
                key={ms}
                disabled={!settings.hoverToOpen}
                className={settings.hoverDelayMs === ms ? 'active' : ''}
                onClick={() => update({ hoverDelayMs: ms })}
              >
                {label}
              </button>
            ))}
          </div>
        </Row>
        <Row
          label="Start with Windows"
          hint={info.canStartWithWindows ? undefined : 'Not available in this copy (dev or test build)'}
        >
          <Switch
            on={info.startWithWindows}
            disabled={!info.canStartWithWindows}
            onChange={(on) => api.setStartWithWindows(on).then(setInfo)}
          />
        </Row>
      </Section>

      <MascotSettings />

      <ClipboardSettings />

      <Section title="About">
        <Row label={`Pulse ${info.version}`} hint="Everything stays on this PC. No account, no tracking.">
          <div className="st-actions">
            <button className="btn btn-small" onClick={api.openDataFolder}>
              <FolderOpen size={13} /> Data folder
            </button>
            <button className="btn btn-small" onClick={api.quit}>
              <Power size={13} /> Quit
            </button>
          </div>
        </Row>
        <UpdateRow />
      </Section>
    </div>
  )
}

function updateText(s: UpdateStatus, now: number): string {
  switch (s.state) {
    case 'unavailable':
      return s.reason
    case 'idle':
      return 'Checks GitHub for new versions automatically'
    case 'checking':
      return 'Checking for updates…'
    case 'up-to-date':
      return `Up to date · checked ${relativeTime(s.checkedAt, now) === 'now' ? 'just now' : `${relativeTime(s.checkedAt, now)} ago`}`
    case 'downloading':
      return `Downloading ${s.version}…`
    case 'ready':
      return `Version ${s.version} is ready. Pulse restarts into it when you're away.`
    case 'needs-reinstall':
      return `Version ${s.version} needs a fresh install: run Install Pulse.cmd`
    case 'error':
      return `Couldn't check for updates: ${s.message}`
  }
}

function UpdateRow(): JSX.Element {
  const { call } = useWidget('updater')
  const status = useWidgetValue<UpdateStatus>('updater', 'getStatus', 'status', { state: 'idle' })
  const now = useNow()
  const busy = status.state === 'checking' || status.state === 'downloading'

  return (
    <Row label="Updates" hint={updateText(status, now)}>
      {status.state === 'ready' ? (
        <button className="btn btn-primary btn-small" onClick={() => call('restart')}>
          <RefreshCw size={13} /> Restart now
        </button>
      ) : status.state !== 'unavailable' ? (
        <button className="btn btn-small" disabled={busy} onClick={() => call('check')}>
          <RefreshCw size={13} className={busy ? 'st-spin' : ''} /> Check now
        </button>
      ) : (
        <span />
      )}
    </Row>
  )
}

const MOMENTS: Array<[MascotMoment, string, string, MascotScene]> = [
  ['greetings', 'Greetings', 'Good morning, afternoon and evening, once each', 'wave'],
  ['focus', 'Focus sessions', 'Typing when focus starts, coffee on breaks', 'typing'],
  ['celebrations', 'Celebrations', 'A happy jump when a timer finishes', 'celebrate'],
  ['bedtime', 'Bedtime nudge', 'Once a night, if you are up after midnight', 'sleepy'],
  ['music', 'Music', 'Headphones on while a song plays, and each new song shown briefly', 'music']
]

function MascotSettings(): JSX.Element | null {
  const { call } = useWidget('mascot')
  const prefs = usePulse((s) => s.mascot)
  const close = usePulse((s) => s.close)
  const [name, setName] = useState(prefs?.name ?? '')

  useEffect(() => setName(prefs?.name ?? ''), [prefs?.name])

  if (!prefs) return null
  const save = (patch: Partial<MascotPrefs>): void => {
    call('setPrefs', patch)
  }
  // Scenes play on the collapsed notch, so close the panel to watch.
  const preview = (scene: MascotScene): void => {
    api.log(`Preview clicked: ${scene}`)
    close()
    call('preview', scene).catch((err) => api.log(`preview failed: ${err}`))
  }

  // Handlers for anything that plays a preview.
  const previewOn = (scene: MascotScene) => ({
    disabled: !prefs.enabled,
    // Acts on press: clicking an unfocused Pulse window can scroll the page between press and
    // release, and then the browser never reports a click.
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      // Keep the press from reaching the notch, whose press handler would reopen the panel that
      // preview() just closed.
      e.stopPropagation()
      preview(scene)
    },
    // Keyboard activation (Enter/Space) arrives as a click with detail 0.
    onClick: (e: MouseEvent<HTMLButtonElement>) => e.detail === 0 && preview(scene)
  })

  return (
    <Section title="Mascot">
      <Row label="Boo" hint="A friendly little ghost who shows up for a few moments of your day. Click Boo to say hi.">
        <div className="st-actions">
          <button className="st-boo" title="Say hi (plays the greeting)" {...previewOn('wave')}>
            <SceneArt scene="wave" />
          </button>
          <Switch on={prefs.enabled} onChange={(enabled) => save({ enabled })} />
        </div>
      </Row>
      <Row
        label="Boo lives in the notch"
        hint="When you're not using Pulse, the notch shrinks to Boo's tiny home. Boo watches your pointer and catches what you copy."
      >
        <div className="st-actions">
          <button className="btn btn-small st-preview" {...previewOn('catch')}>
            <Play size={11} /> Preview
          </button>
          <Switch
            on={prefs.notch !== false}
            disabled={!prefs.enabled}
            onChange={(notch) => save({ notch })}
          />
        </div>
      </Row>
      <Row label="Your name" hint="Used in greetings; leave empty for just “Good morning!”">
        <input
          className="field st-name"
          value={name}
          maxLength={30}
          disabled={!prefs.enabled}
          placeholder="Name"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== prefs.name && save({ name })}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />
      </Row>
      {MOMENTS.map(([moment, label, hint, scene]) => (
        <Row key={moment} label={label} hint={hint}>
          <div className="st-actions">
            <button className="btn btn-small st-preview" {...previewOn(scene)}>
              <Play size={11} /> Preview
            </button>
            <Switch
              on={prefs.moments[moment]}
              disabled={!prefs.enabled}
              onChange={(on) => save({ moments: { ...prefs.moments, [moment]: on } })}
            />
          </div>
        </Row>
      ))}
    </Section>
  )
}

function ClipboardSettings(): JSX.Element {
  const { call } = useWidget('clipboard')
  const [paused, setPaused] = useState(false)
  const [blocked, setBlocked] = useState<string[]>([])
  const [draft, setDraft] = useState('')

  useEffect(() => {
    call<{ paused: boolean }>('query', { limit: 1 }).then((r) => setPaused(r.paused))
    call<string[]>('getBlockedApps').then(setBlocked)
  }, [call])

  const save = (apps: string[]): void => {
    call<string[]>('setBlockedApps', apps).then(setBlocked)
  }

  return (
    <Section title="Clipboard">
      <Row label="Save copies" hint="Items marked private by other apps are never saved">
        <Switch
          on={!paused}
          onChange={(on) => {
            setPaused(!on)
            call('setPaused', !on)
          }}
        />
      </Row>
      <Row label="Never save from" hint="Copies made in these apps are ignored" stacked>
        <div className="st-apps">
          {blocked.map((app) => (
            <span key={app} className="st-app">
              {app}
              <button title={`Allow ${app}`} onClick={() => save(blocked.filter((a) => a !== app))}>
                <X size={11} />
              </button>
            </span>
          ))}
          <input
            className="field st-app-input"
            placeholder="Add app, e.g. keepass.exe"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft.trim()) {
                save([...blocked, draft])
                setDraft('')
              }
            }}
          />
        </div>
      </Row>
    </Section>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="st-section">
      <span className="section-label">{title}</span>
      <div className="st-card">{children}</div>
    </section>
  )
}

function Row({
  label,
  hint,
  stacked,
  children
}: {
  label: string
  hint?: string
  stacked?: boolean
  children: ReactNode
}): JSX.Element {
  return (
    <div className={`st-row${stacked ? ' stacked' : ''}`}>
      <div className="st-row-text">
        <span>{label}</span>
        {hint && <span className="muted small">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function Switch({
  on,
  disabled,
  onChange
}: {
  on: boolean
  disabled?: boolean
  onChange: (on: boolean) => void
}): JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={disabled}
      className={`switch${on ? ' on' : ''}`}
      onClick={() => onChange(!on)}
    >
      <span />
    </button>
  )
}

// ---------- Shortcut recording ----------

const CODE_KEYS: Record<string, string> = {
  Space: 'Space',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right'
}

/** Electron accelerator for a key press, or null while only modifiers are held or it's unusable. */
function toAccelerator(e: KeyboardEvent): string | null {
  const key =
    e.code.match(/^Key([A-Z])$/)?.[1] ??
    e.code.match(/^Digit(\d)$/)?.[1] ??
    e.code.match(/^(F\d{1,2})$/)?.[1] ??
    CODE_KEYS[e.code]
  if (!key) return null
  const mods = [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super']
  // A global shortcut without Ctrl/Alt/Win would swallow normal typing; F-keys are the exception.
  if (!e.ctrlKey && !e.altKey && !e.metaKey && !/^F\d/.test(key)) return null
  return [...mods.filter(Boolean), key].join('+')
}

const KEY_LABEL: Record<string, string> = { Control: 'Ctrl', Super: 'Win' }

function Keycaps({ accelerator }: { accelerator: string }): JSX.Element {
  return (
    <span className="st-keys">
      {accelerator.split('+').map((k, i) => (
        <kbd key={i}>{KEY_LABEL[k] ?? k}</kbd>
      ))}
    </span>
  )
}

function ShortcutField({
  value,
  onChange
}: {
  value: string | null
  onChange: (accelerator: string) => Promise<string | undefined>
}): JSX.Element {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stop = (): void => {
    setRecording(false)
    api.suspendShortcut(false)
  }

  // Never leave the global shortcut switched off if the page goes away mid-recording.
  useEffect(() => () => api.suspendShortcut(false), [])

  const onKeyDown = async (e: KeyboardEvent): Promise<void> => {
    if (!recording) return
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape' && !e.ctrlKey && !e.altKey) return stop()
    const accelerator = toAccelerator(e)
    if (!accelerator) return
    const err = await onChange(accelerator)
    setError(err ?? null)
    stop()
  }

  return (
    <div className="st-shortcut">
      <button
        className={`st-shortcut-field${recording ? ' recording' : ''}`}
        onClick={() => {
          setError(null)
          setRecording(true)
          api.suspendShortcut(true)
        }}
        onKeyDown={onKeyDown}
        onBlur={() => recording && stop()}
      >
        {recording ? (
          <span className="muted">Press keys… (Esc to cancel)</span>
        ) : value ? (
          <Keycaps accelerator={value} />
        ) : (
          <span className="muted">Not set</span>
        )}
      </button>
      {error && <span className="st-error small">{error}</span>}
    </div>
  )
}
