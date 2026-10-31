# PULSE

Notch for laptop. A notch at the top of the screen for the things you reach for all day: clipboard history,
timers and focus sessions, a file shelf, notes, links, screen time, system stats, phone drop, and
Boo the ghost. Windows, Electron + React. Personal project: everything stays on the PC.

## How updates work

```
change the code ─► push to main ─► GitHub Actions builds a release ─► installed Pulse updates itself
```

- **Workflow** (`.github/workflows/release.yml`): every push to `main` is type-checked, built, and
  published as release `v0.1.<run number>` with `pulse-app.zip` (the app, ~1 MB) and
  `pulse-update.json` (its version, Electron version and SHA-256).
- **Installed Pulse** checks the latest release 30 s after starting, every 6 hours, and on wake.
  It verifies the download, unpacks it as a new version, and restarts into it once you've been away
  from the keyboard for 2 minutes (or straight away via Settings → About → Restart now).
- **Safety net** (`loader/main.cjs`): a new version that fails to start is rolled back to the
  previous one automatically, and that version isn't downloaded again.

## Install on a PC (once)

Double-click **`Install Pulse.cmd`** (needs Node.js). It builds Pulse and installs it to
`%LOCALAPPDATA%\Programs\Pulse`, adds it to the Start menu and Settings → Apps, and turns on
start with Windows. After that, updates arrive from GitHub on their own. Re-run it only if an
update asks for a fresh install (when the Electron version changes).

## Develop

```
npm ci            # once, to get the build tools
npm run dev       # Pulse with live reload; uses its own data ("Pulse Dev")
npm run typecheck
```

Widgets live in `src/widgets/<id>/` (`manifest.ts`, `ui.tsx`, optional `service.ts`).
Logs: `%APPDATA%\Pulse\logs\pulse.log`.
