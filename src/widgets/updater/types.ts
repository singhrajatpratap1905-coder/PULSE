export type UpdateStatus =
  /** Not an installed copy (dev, run from the project), or no GitHub repo configured. */
  | { state: 'unavailable'; reason: string }
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'up-to-date'; checkedAt: number }
  | { state: 'downloading'; version: string }
  /** Downloaded and verified; Pulse restarts into it when you're away, or on "Restart now". */
  | { state: 'ready'; version: string }
  /** The new version needs a newer Electron than this install has: re-run Install Pulse.cmd. */
  | { state: 'needs-reinstall'; version: string }
  | { state: 'error'; message: string; checkedAt: number }
