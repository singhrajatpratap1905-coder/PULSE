import { app, net, powerMonitor } from 'electron'
import { execFileSync } from 'child_process'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { defineService } from '@shared/widget'
import { log } from '@main/log'
import { versionInfo } from '@main/version'
import type { UpdateStatus } from './types'

const FIRST_CHECK_MS = 30_000
const CHECK_EVERY_MS = 6 * 3_600_000
const RESTART_POLL_MS = 30_000
// Restart into a downloaded update only after this long without keyboard or mouse input.
const AWAY_SEC = 120

interface LoaderState {
  current: string
  previous: string | null
  trial: number
  rolledBackFrom?: string
}

interface UpdateManifest {
  version: string
  electron: string
  file: string
  sha256: string
}

interface Release {
  assets: Array<{ name: string; browser_download_url: string }>
}

/** Positive if a is newer than b (plain x.y.z). */
function compare(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0)
  return 0
}

export default defineService((ctx) => {
  // Set by the loader (loader/main.cjs) in installed copies only.
  const installDir = process.env.PULSE_INSTALL_DIR
  const versionDir = process.env.PULSE_VERSION_DIR
  const repo = process.env.PULSE_UPDATE_REPO || versionInfo().updateRepo
  const api = process.env.PULSE_UPDATE_API || 'https://api.github.com'

  let status: UpdateStatus = !installDir || !versionDir
    ? { state: 'unavailable', reason: 'Updates apply to the installed app only.' }
    : !repo
      ? { state: 'unavailable', reason: 'No GitHub repository is set up for updates yet.' }
      : { state: 'idle' }

  const setStatus = (next: UpdateStatus): void => {
    status = next
    ctx.emit('status', status)
  }

  ctx.handle('getStatus', () => status)
  if (status.state === 'unavailable' || !installDir || !versionDir || !repo) return

  const versionsDir = join(installDir, 'versions')
  const stateFile = join(versionsDir, 'state.json')
  const running = basename(versionDir)
  const readState = (): LoaderState => JSON.parse(readFileSync(stateFile, 'utf8')) as LoaderState
  const writeState = (s: LoaderState): void => writeFileSync(stateFile, JSON.stringify(s, null, 2))

  // ---------- After a restart: say what happened ----------
  try {
    const state = readState()
    if (state.rolledBackFrom) {
      ctx.activity({
        title: 'Update failed to start',
        detail: `Back on ${running}`,
        tone: 'warning',
        important: true,
        durationMs: 6000
      })
      log.warn(`update ${state.rolledBackFrom} failed to start; rolled back to ${running}, and won't retry it`)
      // Don't download it again; a later release replaces it.
      ctx.store.set('badVersion', state.rolledBackFrom)
      writeState({ current: state.current, previous: state.previous, trial: state.trial })
    } else {
      const last = ctx.store.get<string | null>('lastRunVersion', null)
      if (last && last !== running) {
        ctx.activity({ title: 'Pulse updated', detail: `Version ${running}`, tone: 'success', important: true })
        log.info(`now running ${running} (was ${last})`)
      }
    }
  } catch (err) {
    log.warn('could not read versions/state.json:', err)
  }
  ctx.store.set('lastRunVersion', running)

  /** The UI is up, so this version works: stop counting it as a trial, and tidy old versions. */
  ctx.handle('healthy', () => {
    try {
      const state = readState()
      if (state.current === running && state.trial > 0) {
        writeState({ ...state, trial: 0 })
        log.info(`version ${running} started fine`)
      }
      // Keep the running version, the one before it, and any downloaded update; remove the rest.
      const pending = 'version' in status ? status.version : null
      for (const dir of readdirSync(versionsDir)) {
        const keep = dir === running || dir === state.previous || dir === state.current || dir === pending || dir === 'state.json'
        if (!keep) rmSync(join(versionsDir, dir), { recursive: true, force: true })
      }
    } catch (err) {
      log.warn('could not update versions/state.json:', err)
    }
  })

  // ---------- Checking and downloading ----------
  const getJson = async <T>(url: string): Promise<T> => {
    const res = await net.fetch(url, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Pulse-updater' }
    })
    if (!res.ok) throw Object.assign(new Error(`${res.status} ${res.statusText}`), { status: res.status })
    return (await res.json()) as T
  }

  let busy = false
  const check = async (): Promise<UpdateStatus> => {
    if (busy || status.state === 'ready' || status.state === 'downloading') return status
    busy = true
    setStatus({ state: 'checking' })
    try {
      let release: Release
      try {
        release = await getJson<Release>(`${api}/repos/${repo}/releases/latest`)
      } catch (err) {
        // No releases published yet.
        if ((err as { status?: number }).status === 404) return setStatusAnd({ state: 'up-to-date', checkedAt: Date.now() })
        throw err
      }
      const asset = (name: string): string => {
        const found = release.assets.find((a) => a.name === name)
        if (!found) throw new Error(`release has no ${name}`)
        return found.browser_download_url
      }
      const manifest = await getJson<UpdateManifest>(asset('pulse-update.json'))

      if (compare(manifest.version, running) <= 0) return setStatusAnd({ state: 'up-to-date', checkedAt: Date.now() })
      if (manifest.version === ctx.store.get<string | null>('badVersion', null)) {
        log.info(`skipping ${manifest.version}: it failed to start before`)
        return setStatusAnd({ state: 'up-to-date', checkedAt: Date.now() })
      }
      if (manifest.electron !== process.versions.electron) {
        log.warn(`update ${manifest.version} needs Electron ${manifest.electron}; this install has ${process.versions.electron}`)
        return setStatusAnd({ state: 'needs-reinstall', version: manifest.version })
      }

      const target = join(versionsDir, manifest.version)
      if (!existsSync(join(target, 'out', 'main', 'index.js'))) {
        setStatus({ state: 'downloading', version: manifest.version })
        log.info(`downloading update ${manifest.version}`)
        const res = await net.fetch(asset(manifest.file), { headers: { 'User-Agent': 'Pulse-updater' } })
        if (!res.ok) throw new Error(`download failed: ${res.status}`)
        const zip = Buffer.from(await res.arrayBuffer())
        const sha256 = createHash('sha256').update(zip).digest('hex')
        if (sha256 !== manifest.sha256) throw new Error('downloaded update does not match its checksum')

        // Unpack beside the running version, then move into place only once complete.
        const zipPath = join(versionsDir, `${manifest.version}.zip`)
        const partial = `${target}.partial`
        rmSync(partial, { recursive: true, force: true })
        mkdirSync(partial, { recursive: true })
        writeFileSync(zipPath, zip)
        const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
        try {
          execFileSync(tar, ['-x', '-f', zipPath, '-C', partial], { windowsHide: true })
        } finally {
          rmSync(zipPath, { force: true })
        }
        if (!existsSync(join(partial, 'out', 'main', 'index.js'))) throw new Error('update is missing its app files')
        rmSync(target, { recursive: true, force: true })
        renameSync(partial, target)
      }

      // The loader runs it next start, as a trial: two failed starts and it goes back to this one.
      writeState({ current: manifest.version, previous: running, trial: 1 })
      log.info(`update ${manifest.version} ready; restarting when you're away`)
      ctx.activity({ title: 'Update ready', detail: `Pulse ${manifest.version} · restarts when you're away` })
      return setStatusAnd({ state: 'ready', version: manifest.version })
    } catch (err) {
      log.warn('update check failed:', err)
      return setStatusAnd({ state: 'error', message: (err as Error).message, checkedAt: Date.now() })
    } finally {
      busy = false
    }
  }
  const setStatusAnd = (next: UpdateStatus): UpdateStatus => {
    setStatus(next)
    return next
  }

  const restart = (): void => {
    log.info('restarting into the update')
    app.relaunch()
    app.quit()
  }

  ctx.handle('check', check)
  ctx.handle('restart', () => status.state === 'ready' && restart())

  const first = setTimeout(check, FIRST_CHECK_MS)
  const periodic = setInterval(check, CHECK_EVERY_MS)
  // Apply a ready update while you're away from the PC, so it never interrupts you.
  const restartPoll = setInterval(() => {
    if (status.state === 'ready' && powerMonitor.getSystemIdleTime() >= AWAY_SEC) restart()
  }, RESTART_POLL_MS)
  const onResume = (): void => {
    setTimeout(check, 10_000)
  }
  powerMonitor.on('resume', onResume)

  return () => {
    clearTimeout(first)
    clearInterval(periodic)
    clearInterval(restartPoll)
    powerMonitor.off('resume', onResume)
  }
})
