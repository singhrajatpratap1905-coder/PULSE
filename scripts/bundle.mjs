// Packages one version of Pulse as an update for installed copies (run by GitHub Actions).
//
//   node scripts/bundle.mjs --build <n> --out <dir> [--no-build]
//
// Writes to <dir>:
//   pulse-app.zip        the version folder (see scripts/lib/stage.mjs)
//   pulse-update.json    { version, electron, file, sha256, size } — what installed copies read
import { execFileSync, execSync } from 'child_process'
import { createHash } from 'crypto'
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { electronVersion, stageApp, versionFor } from './lib/stage.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const arg = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const out = resolve(arg('--out', join(root, 'release')))
const version = versionFor(root, Number(arg('--build', '0')))

if (!args.includes('--no-build')) execSync('npx electron-vite build', { cwd: root, stdio: 'inherit' })

rmSync(out, { recursive: true, force: true })
const staging = join(out, 'staging')
stageApp(root, staging, { version })

// Windows' own tar writes and reads zip files; installed copies use it to unpack updates.
const zip = join(out, 'pulse-app.zip')
const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
execFileSync(tar, ['-a', '-c', '-f', zip, '-C', staging, '.'])
rmSync(staging, { recursive: true, force: true })

const sha256 = createHash('sha256').update(readFileSync(zip)).digest('hex')
const manifest = { version, electron: electronVersion(root), file: 'pulse-app.zip', sha256, size: statSync(zip).size }
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'pulse-update.json'), JSON.stringify(manifest, null, 2))
console.log(`Packaged Pulse ${version} (${(manifest.size / 1024 / 1024).toFixed(1)} MB) in ${out}`)
