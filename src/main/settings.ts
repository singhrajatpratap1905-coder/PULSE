import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import type { Settings } from '@shared/types'

const DEFAULTS: Settings = {
  shortcut: 'Control+Alt+Space',
  hoverToOpen: true,
  hoverDelayMs: 200,
  autostartInitialized: false
}

let cache: Settings | null = null

const file = (): string => join(app.getPath('userData'), 'settings.json')

export function getSettings(): Settings {
  if (!cache) {
    try {
      cache = { ...DEFAULTS, ...JSON.parse(readFileSync(file(), 'utf8')) }
    } catch {
      cache = { ...DEFAULTS }
    }
  }
  return cache!
}

export function updateSettings(patch: Partial<Settings>): Settings {
  cache = { ...getSettings(), ...patch }
  mkdirSync(dirname(file()), { recursive: true })
  writeFileSync(file(), JSON.stringify(cache, null, 2))
  return cache
}
