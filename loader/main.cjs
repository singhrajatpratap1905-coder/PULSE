// Pulse's loader: the small, never-updated part of an installed Pulse. Electron runs this
// (from resources/app); it picks which downloaded version to start from versions/, and goes back
// to the previous version if a fresh update fails to start twice in a row.
//
// versions/state.json: { current, previous, trial }
//   trial > 0 means `current` hasn't proven it starts yet; Pulse sets it to 0 once its UI is up.
const fs = require('fs')
const path = require('path')

const installDir = path.resolve(__dirname, '..', '..')
const versionsDir = path.join(installDir, 'versions')
const stateFile = path.join(versionsDir, 'state.json')
const entry = (version) => path.join(versionsDir, version, 'out', 'main', 'index.js')

const compare = (a, b) => {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0)
  return 0
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  } catch {
    return null
  }
}

let state = readState()
if (!state || !fs.existsSync(entry(state.current))) {
  // No usable record: run the newest complete version present.
  const installed = fs
    .readdirSync(versionsDir)
    .filter((d) => /^\d+\.\d+\.\d+$/.test(d) && fs.existsSync(entry(d)))
    .sort(compare)
  state = { current: installed[installed.length - 1], previous: null, trial: 0 }
}

// A new version gets two starts to report in (its UI coming up); after that, roll back.
if (state.trial > 0) {
  if (state.trial >= 3 && state.previous && fs.existsSync(entry(state.previous))) {
    state = { current: state.previous, previous: null, trial: 0, rolledBackFrom: state.current }
  } else {
    state.trial++
  }
}
fs.writeFileSync(stateFile, JSON.stringify(state, null, 2))

process.env.PULSE_INSTALL_DIR = installDir
process.env.PULSE_VERSION_DIR = path.join(versionsDir, state.current)
try {
  require(entry(state.current))
} catch (err) {
  // The version can't even load. Go straight back to the previous one, rather than leaving
  // Electron's error dialog on screen.
  const { app } = require('electron')
  console.error(err)
  if (state.previous && fs.existsSync(entry(state.previous))) {
    fs.writeFileSync(
      stateFile,
      JSON.stringify({ current: state.previous, previous: null, trial: 0, rolledBackFrom: state.current }, null, 2)
    )
    app.relaunch()
  }
  app.exit(1)
}
