// Installs Pulse for this Windows user, without an installer exe (which Smart App Control would
// block, being unsigned). Electron's runtime is copied unchanged, so Windows keeps trusting it.
//
// Layout (in %LOCALAPPDATA%\Programs\Pulse):
//   Pulse.exe ...                Electron's runtime, renamed
//   resources\app\               the loader (loader/), which starts the current version
//   versions\<version>\          the app itself; updates from GitHub add new version folders
//   versions\state.json          which version to run (see loader/main.cjs)
//
//   node scripts/install.mjs              build, install, start
//   --target <dir>                        install somewhere else
//   --no-build --no-stop --no-register --no-launch   skip those steps (for testing)
//
// Run it from Explorer via "Install Pulse.cmd". After that, Pulse updates itself from GitHub.
import { execFileSync, execSync, spawn } from 'child_process'
import { cpSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'fs'
import { createRequire } from 'module'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { stageApp, versionFor } from './lib/stage.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const targetArg = args.indexOf('--target')
const target = resolve(targetArg >= 0 ? args[targetArg + 1] : join(process.env.LOCALAPPDATA, 'Programs', 'Pulse'))
// Local installs are build 0: any release from GitHub counts as newer and replaces it.
const version = versionFor(root, 0)

const step = (msg) => console.log(`\n» ${msg}`)
const ps = (command) => execFileSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8' })

// ---------- 1. Build ----------
if (!flag('--no-build')) {
  step('Building Pulse')
  execSync('npm run typecheck', { cwd: root, stdio: 'inherit' })
  execSync('npx electron-vite build', { cwd: root, stdio: 'inherit' })
}

// ---------- 2. Stop running copies (installed, or run from this project) ----------
if (!flag('--no-stop')) {
  step('Stopping Pulse if it is running')
  const esc = (s) => s.replace(/'/g, "''")
  ps(`
    $target = '${esc(target)}'; $project = '${esc(root)}'
    Get-CimInstance Win32_Process -Filter "Name='Pulse.exe' OR Name='electron.exe'" |
      Where-Object { ($_.ExecutablePath -and $_.ExecutablePath.StartsWith($target, 'OrdinalIgnoreCase')) -or
                     ($_.CommandLine -and $_.CommandLine.Contains($project)) } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  `)
  // Give Windows a moment to release the files.
  execSync('ping -n 3 127.0.0.1 > nul')
}

// ---------- 3. Runtime, loader, and this version ----------
step(`Installing Pulse ${version} to ${target}`)
rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
mkdirSync(target, { recursive: true })

// Electron's runtime, unmodified (renaming keeps it the same file Windows already trusts).
const electronDist = join(dirname(createRequire(import.meta.url).resolve('electron')), 'dist')
cpSync(electronDist, target, { recursive: true })
renameSync(join(target, 'electron.exe'), join(target, 'Pulse.exe'))
rmSync(join(target, 'resources', 'default_app.asar'), { force: true })
cpSync(join(root, 'build', 'icon.ico'), join(target, 'pulse.ico'))

cpSync(join(root, 'loader'), join(target, 'resources', 'app'), { recursive: true })
stageApp(root, join(target, 'versions', version), { version })
writeFileSync(
  join(target, 'versions', 'state.json'),
  JSON.stringify({ current: version, previous: null, trial: 0 }, null, 2)
)

// ---------- 4. Uninstaller ----------
writeFileSync(
  join(target, 'uninstall.ps1'),
  `# Uninstalls Pulse for this user. Your data in %APPDATA%\\Pulse is kept.
$dir = $PSScriptRoot
Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith($dir, 'OrdinalIgnoreCase') } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# Start with Windows: any Run entry that points into this folder.
foreach ($key in 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run') {
  $props = Get-ItemProperty $key -ErrorAction SilentlyContinue
  if ($props) {
    $props.PSObject.Properties | Where-Object { $_.Name -eq 'com.pulse.app' -or "$($_.Value)" -like "*$dir*" } |
      ForEach-Object { Remove-ItemProperty $key -Name $_.Name -ErrorAction SilentlyContinue }
  }
}

$programs = [Environment]::GetFolderPath('Programs')
Remove-Item (Join-Path $programs 'Pulse.lnk') -ErrorAction SilentlyContinue
Remove-Item (Join-Path $programs 'Startup\\Pulse.lnk') -ErrorAction SilentlyContinue
Remove-Item 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Pulse' -Recurse -ErrorAction SilentlyContinue

# This script runs from inside the folder, so delete it a moment after exiting.
Start-Process cmd.exe -ArgumentList "/c timeout /t 2 >nul & rmdir /s /q \`"$dir\`"" -WindowStyle Hidden
`
)

// ---------- 5. Register in Settings > Apps ----------
if (!flag('--no-register')) {
  step('Registering in Settings > Apps')
  const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Pulse'
  const reg = (name, type, data) =>
    execFileSync('reg.exe', ['add', key, '/v', name, '/t', type, '/d', data, '/f'], { stdio: 'ignore' })
  reg('DisplayName', 'REG_SZ', 'Pulse')
  reg('DisplayVersion', 'REG_SZ', version)
  reg('Publisher', 'REG_SZ', 'Pulse (personal build)')
  reg('DisplayIcon', 'REG_SZ', join(target, 'pulse.ico'))
  reg('InstallLocation', 'REG_SZ', target)
  reg('UninstallString', 'REG_SZ', `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${join(target, 'uninstall.ps1')}"`)
  reg('NoModify', 'REG_DWORD', '1')
  reg('NoRepair', 'REG_DWORD', '1')
  reg('EstimatedSize', 'REG_DWORD', String(Math.round(dirSizeBytes(target) / 1024)))

  // Pulse used to start from the project folder; the installed copy replaces that.
  rmSync(join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Pulse.lnk'), { force: true })
}

// ---------- 6. Start it ----------
if (!flag('--no-launch')) {
  step('Starting Pulse')
  spawn(join(target, 'Pulse.exe'), ['--enable-autostart'], { cwd: target, detached: true, stdio: 'ignore' }).unref()
}

console.log(`\nDone. Pulse ${version} is installed in ${target}.`)
console.log('It is in the Start menu, starts with Windows, and updates itself from GitHub releases.')

function dirSizeBytes(dir) {
  let total = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    total += entry.isDirectory() ? dirSizeBytes(p) : statSync(p).size
  }
  return total
}
