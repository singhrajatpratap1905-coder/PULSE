// Notes are plain text. A line like "- [ ] milk" is an open checklist item, "- [x] milk" a done one.

export interface Note {
  id: string
  body: string
  createdAt: number
  updatedAt: number
}

export interface NotePreview {
  id: string
  title: string
  snippet: string
  updatedAt: number
  checklist: { done: number; total: number }
}

export const MAX_NOTE_CHARS = 100_000

/** Leading indent, list marker (with optional checkbox), and the rest of a line. */
export const LIST_LINE_RE = /^(\s*)([-*] (?:\[([ xX])\] )?)(.*)$/

const CHECK_LINE_RE = /^\s*[-*] \[([ xX])\] /

export function isChecklistLine(line: string): boolean {
  return CHECK_LINE_RE.test(line)
}

export function isChecked(line: string): boolean {
  return /^\s*[-*] \[[xX]\] /.test(line)
}

/** Flips "- [ ] " and "- [x] "; turns any other line into an open checklist item. */
export function toggleChecklistLine(line: string): string {
  const m = line.match(/^(\s*[-*] \[)([ xX])(\] .*)$/s)
  if (m) return `${m[1]}${m[2] === ' ' ? 'x' : ' '}${m[3]}`
  const indent = line.match(/^\s*/)![0]
  const rest = line.slice(indent.length).replace(/^[-*] /, '')
  return `${indent}- [ ] ${rest}`
}

/** Text of a line without markdown-ish markers. */
export function stripMarkers(line: string): string {
  return line
    .trim()
    .replace(CHECK_LINE_RE, '')
    .replace(/^[-*] /, '')
    .replace(/^#+\s*/, '')
    .trim()
}

export function checklistStats(body: string): { done: number; total: number } {
  let done = 0
  let total = 0
  for (const line of body.split('\n')) {
    if (!isChecklistLine(line)) continue
    total++
    if (isChecked(line)) done++
  }
  return { done, total }
}

export function notePreview(note: Note): NotePreview {
  const lines = note.body
    .split('\n')
    .map(stripMarkers)
    .filter(Boolean)
  return {
    id: note.id,
    title: (lines[0] ?? '').slice(0, 80) || 'New note',
    snippet: lines.slice(1).join(' · ').slice(0, 120),
    updatedAt: note.updatedAt,
    checklist: checklistStats(note.body)
  }
}
