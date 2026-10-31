import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useWidget } from '@renderer/widgets/sdk'
import { LIST_LINE_RE, isChecked, isChecklistLine, toggleChecklistLine, type Note } from './types'

export const ID = 'notes'

const SAVE_DELAY_MS = 400

/** Start and end offsets of the line containing `pos`. */
function lineAt(text: string, pos: number): [number, number] {
  const start = text.lastIndexOf('\n', pos - 1) + 1
  const end = text.indexOf('\n', pos)
  return [start, end < 0 ? text.length : end]
}

/** Replaces a range through the browser's editing path, so Ctrl+Z still works. */
function replaceRange(el: HTMLTextAreaElement, start: number, end: number, text: string): void {
  el.setSelectionRange(start, end)
  document.execCommand('insertText', false, text)
}

interface EditorProps {
  note: Note
  mode: 'edit' | 'view'
  onBodyChange: (body: string) => void
  onRequestEdit: () => void
}

/** Edits one note; saves on its own shortly after typing stops and when switching away. */
export function Editor({ note, mode, onBodyChange, onRequestEdit }: EditorProps): JSX.Element {
  const { call } = useWidget(ID)
  const [body, setBody] = useState(note.body)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const latest = useRef({ body, saved: note.body })
  latest.current.body = body

  useEffect(() => {
    if (body === latest.current.saved) return
    const timer = setTimeout(() => {
      latest.current.saved = body
      call('update', note.id, body)
    }, SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [body, call, note.id])

  // Don't lose the last few keystrokes when switching notes or closing the panel.
  useEffect(
    () => () => {
      const { body, saved } = latest.current
      if (body !== saved) call('update', note.id, body)
    },
    [call, note.id]
  )

  const change = (next: string): void => {
    setBody(next)
    onBodyChange(next)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    const el = e.currentTarget
    const [start, end] = lineAt(el.value, el.selectionStart)
    const line = el.value.slice(start, end)

    // Ctrl+Enter: tick/untick the current line, or make it a checklist item.
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault()
      const caret = el.selectionStart
      const next = toggleChecklistLine(line)
      replaceRange(el, start, end, next)
      el.setSelectionRange(caret + next.length - line.length, caret + next.length - line.length)
      return
    }

    // Enter on a list line continues the list; on an empty item it ends the list.
    if (e.key === 'Enter' && !e.shiftKey && el.selectionStart === el.selectionEnd) {
      const m = line.match(LIST_LINE_RE)
      if (!m) return
      e.preventDefault()
      const [, indent, marker, , rest] = m
      if (!rest.trim()) return replaceRange(el, start, end, indent)
      const nextMarker = marker.replace(/\[[xX]\]/, '[ ]')
      replaceRange(el, el.selectionStart, el.selectionStart, `\n${indent}${nextMarker}`)
    }
  }

  const toggleLine = (index: number): void => {
    const lines = body.split('\n')
    lines[index] = toggleChecklistLine(lines[index])
    change(lines.join('\n'))
  }

  if (mode === 'view') {
    return (
      <div className="nt-view" onDoubleClick={onRequestEdit} title="Double-click to edit">
        {body.split('\n').map((line, i) => {
          if (isChecklistLine(line)) {
            const text = line.replace(/^\s*[-*] \[[ xX]\] /, '')
            return (
              <label key={i} className={`nt-check${isChecked(line) ? ' checked' : ''}`}>
                <input type="checkbox" checked={isChecked(line)} onChange={() => toggleLine(i)} />
                <span>{text}</span>
              </label>
            )
          }
          if (/^#+\s/.test(line)) return <h3 key={i}>{line.replace(/^#+\s*/, '')}</h3>
          if (/^\s*[-*] /.test(line)) return <li key={i}>{line.replace(/^\s*[-*] /, '')}</li>
          if (!line.trim()) return <div key={i} className="nt-gap" />
          return <p key={i}>{line}</p>
        })}
      </div>
    )
  }

  return (
    <textarea
      ref={textRef}
      className="nt-text"
      value={body}
      autoFocus
      spellCheck
      placeholder={'Write something…\n\n"- [ ] " starts a checklist item; Ctrl+Enter ticks it.'}
      onChange={(e) => change(e.target.value)}
      onKeyDown={onKeyDown}
    />
  )
}
