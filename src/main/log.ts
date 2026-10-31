import { app } from 'electron'
import { appendFileSync, mkdirSync, renameSync, statSync } from 'fs'
import { join } from 'path'
import { format } from 'util'

// A plain-text log at %APPDATA%\Pulse\logs\pulse.log. Pulse usually runs without a console, so
// this is the only record of crashes and errors. Kept small: rotated to pulse.old.log at 1 MB.

const MAX_BYTES = 1024 * 1024

let file: string | null = null

function logFile(): string {
  if (!file) {
    const dir = join(app.getPath('userData'), 'logs')
    mkdirSync(dir, { recursive: true })
    file = join(dir, 'pulse.log')
  }
  return file
}

function write(level: string, args: unknown[]): void {
  try {
    const path = logFile()
    try {
      if (statSync(path).size > MAX_BYTES) renameSync(path, path.replace(/\.log$/, '.old.log'))
    } catch {
      // No log yet.
    }
    appendFileSync(path, `${new Date().toISOString()} ${level.padEnd(5)} ${format(...args)}\n`)
  } catch {
    // Logging must never take the app down.
  }
}

export const log = {
  info: (...args: unknown[]): void => write('info', args),
  warn: (...args: unknown[]): void => write('warn', args),
  error: (...args: unknown[]): void => write('error', args)
}

/**
 * Mirrors console warnings and errors into the log, and records the events that can end or
 * break the app: crashes of any Chromium process, uncaught exceptions, and quitting.
 */
export function installLogging(): void {
  for (const level of ['warn', 'error'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      write(level, args)
      original(...args)
    }
  }

  process.on('uncaughtException', (err) => write('error', ['uncaught exception:', err]))
  process.on('unhandledRejection', (reason) => write('error', ['unhandled rejection:', reason]))

  app.on('child-process-gone', (_e, details) =>
    write('error', [`${details.type} process gone: ${details.reason} (exit ${details.exitCode})`])
  )
  app.on('before-quit', () => write('info', ['quitting']))
}
