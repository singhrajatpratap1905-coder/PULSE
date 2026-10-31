import { Gauge, useStats } from './Page'
import { percentOf } from './types'

/** Home tile: CPU, RAM and disk at a glance. */
export function SystemCard(): JSX.Element {
  const s = useStats()
  const items: Array<[string, number]> = [
    ['CPU', s.cpu],
    ['RAM', percentOf(s.memory)],
    ['Disk', s.disk ? percentOf(s.disk) : 0]
  ]
  return (
    <div className="sy-card">
      {items.map(([label, pct]) => (
        <div key={label} className="sy-card-item">
          <Gauge pct={pct} size={48} stroke={4}>
            <span className="sy-card-pct">{Math.round(pct)}%</span>
          </Gauge>
          <span className="muted small">{label}</span>
        </div>
      ))}
    </div>
  )
}
