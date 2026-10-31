import { app } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'

interface VersionInfo {
  version: string
  /** "owner/name" of the GitHub repo releases come from, if set. */
  updateRepo?: string
}

let info: VersionInfo | null = null

/**
 * The running Pulse version's package.json (next to out/). An installed Pulse is started by a
 * loader whose own package.json never changes, so app.getVersion() would report the loader's.
 */
export function versionInfo(): VersionInfo {
  if (!info) {
    try {
      info = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as VersionInfo
    } catch {
      info = { version: app.getVersion() }
    }
  }
  return info
}

export const pulseVersion = (): string => versionInfo().version
