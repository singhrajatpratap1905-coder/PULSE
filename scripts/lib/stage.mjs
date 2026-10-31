// Shared by install.mjs (this PC) and bundle.mjs (GitHub releases): lays out one version of the
// Pulse app (its build, a minimal package.json, and only its runtime dependencies) in a folder.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import { join, relative } from 'path'

// koffi ships native builds for many platforms; only this one is needed.
const KOFFI_SKIP = /[\\/]koffi[\\/](src|vendor|doc|build[\\/]koffi[\\/](?!win32_x64))/i

export const readPackage = (root) => JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

/** "0.1" from package.json plus a build number: 0.1.<build>. */
export function versionFor(root, build = 0) {
  const [major, minor] = readPackage(root).version.split('.')
  return `${major}.${minor}.${build}`
}

/** The Electron version this build expects to run on. */
export const electronVersion = (root) =>
  JSON.parse(readFileSync(join(root, 'node_modules', 'electron', 'package.json'), 'utf8')).version

export function stageApp(root, dir, { version }) {
  if (!existsSync(join(root, 'out', 'main', 'index.js'))) throw new Error('No build found in out/.')
  const pkg = readPackage(root)
  mkdirSync(dir, { recursive: true })
  cpSync(join(root, 'out'), join(dir, 'out'), { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify(
      {
        name: pkg.name,
        productName: pkg.productName,
        version,
        main: pkg.main,
        updateRepo: pkg.updateRepo,
        electron: electronVersion(root)
      },
      null,
      2
    )
  )

  const depDirs = execSync('npm ls --omit=dev --all --parseable', { cwd: root, encoding: 'utf8' })
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p && p !== root && p.startsWith(join(root, 'node_modules')))
  for (const dep of new Set(depDirs)) {
    cpSync(dep, join(dir, relative(root, dep)), { recursive: true, filter: (src) => !KOFFI_SKIP.test(src) })
  }
}
