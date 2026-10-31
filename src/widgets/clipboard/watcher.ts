import { clipboard, type NativeImage } from 'electron'
import { basename } from 'path'
import { hasClipboardFormat, processPathOfWindow, win32 } from '@main/platform/win32'

const POLL_MS = 400
// Apps often write several formats in a row; read once they've settled.
const SETTLE_MS = 120

export type Captured =
  | { kind: 'text'; text: string; sourceExe?: string }
  | { kind: 'image'; image: NativeImage; sourceExe?: string }

interface WatchOptions {
  isPaused: () => boolean
  /** Lower-case exe name, e.g. "keepass.exe". */
  isBlocked: (exe: string) => boolean
}

export interface ClipboardWatcher {
  /** Call right after Pulse writes the clipboard itself, so that write isn't recorded. */
  markSelfWrite(): void
  stop(): void
}

/**
 * Windows' standard signals that clipboard content must not be kept in history:
 * password managers and other apps set these on secrets they copy.
 */
function isPrivate(): boolean {
  if (hasClipboardFormat('ExcludeClipboardContentFromMonitorProcessing')) return true
  if (hasClipboardFormat('Clipboard Viewer Ignore')) return true
  if (hasClipboardFormat('CanIncludeInClipboardHistory')) {
    const flag = clipboard.readBuffer('CanIncludeInClipboardHistory')
    if (flag.length >= 4 && flag.readUInt32LE(0) === 0) return true
  }
  return false
}

function clipboardOwnerExe(): string | undefined {
  const w = win32()
  if (!w) return undefined
  return processPathOfWindow(w.GetClipboardOwner()) ?? undefined
}

export function watchClipboard(
  onCapture: (captured: Captured) => void,
  { isPaused, isBlocked }: WatchOptions
): ClipboardWatcher {
  const w = win32()
  // With Win32 we watch the cheap sequence number; without it, fall back to comparing text.
  const sequence = (): number | string => (w ? w.GetClipboardSequenceNumber() : clipboard.readText())

  let last = sequence()
  let ignore: number | string | null = null
  let settle: NodeJS.Timeout | undefined

  const read = (): void => {
    if (isPaused() || isPrivate()) return
    const sourceExe = clipboardOwnerExe()
    if (sourceExe && isBlocked(basename(sourceExe).toLowerCase())) return

    const text = clipboard.readText()
    if (text.trim()) return onCapture({ kind: 'text', text, sourceExe })

    const image = clipboard.readImage()
    if (!image.isEmpty()) onCapture({ kind: 'image', image, sourceExe })
  }

  const poll = setInterval(() => {
    const now = sequence()
    if (now === last) return
    last = now
    if (now === ignore) return
    clearTimeout(settle)
    settle = setTimeout(() => {
      try {
        read()
      } catch (err) {
        console.warn('[pulse] clipboard read failed:', err)
      }
    }, SETTLE_MS)
  }, POLL_MS)

  return {
    markSelfWrite: () => {
      last = ignore = sequence()
    },
    stop: () => {
      clearInterval(poll)
      clearTimeout(settle)
    }
  }
}
