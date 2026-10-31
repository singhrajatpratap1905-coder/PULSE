import { defineService, type ActivityInput } from '@shared/widget'

const SAMPLE_ACTIVITIES: ActivityInput[] = [
  { title: 'Copied', detail: 'Image', tone: 'neutral' },
  { title: 'Timer done', detail: 'Focus · 25 min', tone: 'success' },
  { title: 'Battery low', detail: '15%', tone: 'warning' },
  { title: 'Drop failed', detail: 'File is in use', tone: 'danger' }
]

export default defineService((ctx) => {
  let count = ctx.store.get('count', 0)

  const setCount = (next: number): number => {
    count = next
    ctx.store.set('count', count)
    ctx.emit('count', count)
    // Same key, so rapid clicks update one activity instead of queueing many.
    ctx.activity({ title: 'Counter', detail: String(count), key: 'counter' })
    return count
  }

  ctx.handle('getCount', () => count)
  ctx.handle('increment', () => setCount(count + 1))
  ctx.handle('reset', () => setCount(0))
  ctx.handle('sampleActivities', () => SAMPLE_ACTIVITIES.forEach((a) => ctx.activity(a)))

  // Shows the queue works end to end as soon as the app starts.
  const hello = setTimeout(() => ctx.activity({ title: 'Pulse is ready', tone: 'success' }), 2500)
  return () => clearTimeout(hello)
})
