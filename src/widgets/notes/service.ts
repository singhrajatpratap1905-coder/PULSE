import { randomUUID } from 'crypto'
import { defineService } from '@shared/widget'
import { MAX_NOTE_CHARS, notePreview, type Note } from './types'

export default defineService((ctx) => {
  // Blank notes left behind by "New note" are tidied away on start.
  let notes = ctx.store.get<Note[]>('notes', []).filter((n) => n.body.trim())

  const save = (next: Note[]): void => {
    notes = next
    ctx.store.set('notes', notes)
    ctx.emit('changed')
  }

  ctx.handle('list', (search = '') => {
    const needle = String(search).trim().toLowerCase()
    return notes
      .filter((n) => !needle || n.body.toLowerCase().includes(needle))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(notePreview)
  })

  ctx.handle('get', (id: string) => notes.find((n) => n.id === id) ?? null)

  ctx.handle('create', (body = '') => {
    const now = Date.now()
    const note: Note = { id: randomUUID(), body: String(body), createdAt: now, updatedAt: now }
    // Only one blank note at a time: an unused previous one is replaced.
    save([note, ...notes.filter((n) => n.body.trim())])
    return note.id
  })

  ctx.handle('update', (id: string, body: string) => {
    const note = notes.find((n) => n.id === id)
    if (!note || note.body === body) return
    save(
      notes.map((n) =>
        n.id === id ? { ...n, body: String(body).slice(0, MAX_NOTE_CHARS), updatedAt: Date.now() } : n
      )
    )
  })

  ctx.handle('remove', (id: string) => save(notes.filter((n) => n.id !== id)))
})
