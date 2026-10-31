import { app } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { WidgetStore } from '@shared/widget'

const WRITE_DELAY_MS = 250

const dir = (): string => join(app.getPath('userData'), 'widgets')

/** Folder for a widget's own files (images, caches), next to its JSON store. */
export function widgetDataDir(widgetId: string): string {
  const path = join(dir(), widgetId)
  mkdirSync(path, { recursive: true })
  return path
}

// Stores with unsaved changes, flushed together on quit.
const pending = new Set<() => void>()

/** A JSON file per widget at %APPDATA%\Pulse\widgets\<id>.json, written in the background. */
export function openStore(widgetId: string): WidgetStore {
  const file = join(dir(), `${widgetId}.json`)
  let data: Record<string, unknown> = {}
  try {
    data = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    // Missing or unreadable: start empty.
  }

  let timer: NodeJS.Timeout | undefined

  const flush = (): void => {
    clearTimeout(timer)
    pending.delete(flush)
    mkdirSync(dir(), { recursive: true })
    // Write then rename so a crash mid-write never leaves a half-written file.
    writeFileSync(`${file}.tmp`, JSON.stringify(data))
    renameSync(`${file}.tmp`, file)
  }

  const schedule = (): void => {
    clearTimeout(timer)
    pending.add(flush)
    timer = setTimeout(flush, WRITE_DELAY_MS)
  }

  return {
    get: <T>(key: string, fallback: T): T => (key in data ? (data[key] as T) : fallback),
    set: (key, value) => {
      data[key] = value
      schedule()
    },
    delete: (key) => {
      delete data[key]
      schedule()
    }
  }
}

export function flushStores(): void {
  for (const flush of [...pending]) flush()
}
