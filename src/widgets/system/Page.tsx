import type { ReactNode } from 'react'
import { BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, Cpu, HardDrive, MemoryStick } from 'lucide-react'
import { useWidgetValue } from '@renderer/widgets/sdk'
import { percentOf, type SystemStats } from './types'

export const ID = 'system'

const INITIAL: SystemStats = {
  cpu: 0,
  memory: { used: 0, total: 0 },
  disk: null,
  battery: null,
  uptimeSec: 0,
  cpuModel: '',
  cores: 0
}

export function useStats(): SystemStats {
  return useWidgetValue(ID, 'getStats', 'stats', INITIAL)
}

const gb = (bytes: number): string => (bytes / 1024 ** 3).toFixed(bytes >= 100 * 1024 ** 3 ? 0 : 1)

/** Gray below 70%, amber to 90%, red above: busy machines should stand out. */
const level = (pct: number): string => (pct >= 90 ? 'high' : pct >= 70 ? 'mid' : 'ok')

export function Gauge({ pct, size, stroke, children }: { pct: number; size: number; stroke: number; children?: ReactNode }): JSX.Element {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className={`sy-gauge ${level(pct)}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle className="sy-gauge-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle
          className="sy-gauge-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(100, pct) / 100)}
        />
      </svg>
      <div className="sy-gauge-text">{children}</div>
    </div>
  )
}

function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`
}

export function SystemPage(): JSX.Element {
  const s = useStats()
  const mem = percentOf(s.memory)
  const disk = s.disk ? percentOf(s.disk) : 0

  return (
    <div className="sy">
      <section className="sy-gauges">
        <Meter icon={<Cpu size={13} />} label="CPU" pct={s.cpu} detail={`${s.cores} cores`} />
        <Meter
          icon={<MemoryStick size={13} />}
          label="Memory"
          pct={mem}
          detail={`${gb(s.memory.used)} of ${gb(s.memory.total)} GB`}
        />
        <Meter
          icon={<HardDrive size={13} />}
          label={s.disk ? `Disk ${s.disk.drive.replace('\\', '')}` : 'Disk'}
          pct={disk}
          detail={s.disk ? `${gb(s.disk.total - s.disk.used)} GB free` : 'Unavailable'}
        />
      </section>

      <section className="sy-side">
        <Battery battery={s.battery} />
        <div className="sy-facts">
          <Fact label="Up for" value={formatUptime(s.uptimeSec)} />
          <Fact label="Processor" value={s.cpuModel} />
        </div>
      </section>
    </div>
  )
}

function Meter({ icon, label, pct, detail }: { icon: JSX.Element; label: string; pct: number; detail: string }): JSX.Element {
  return (
    <div className="sy-meter">
      <Gauge pct={pct} size={120} stroke={8}>
        <span className="sy-gauge-pct">{Math.round(pct)}%</span>
      </Gauge>
      <span className="sy-meter-label">
        {icon}
        {label}
      </span>
      <span className="muted small">{detail}</span>
    </div>
  )
}

function Battery({ battery }: { battery: SystemStats['battery'] }): JSX.Element {
  if (!battery) {
    return (
      <div className="sy-battery">
        <span className="section-label">Power</span>
        <span className="muted small">No battery: running on mains power.</span>
      </div>
    )
  }
  const { percent, pluggedIn, minutesLeft } = battery
  const Icon = pluggedIn ? BatteryCharging : percent <= 20 ? BatteryLow : percent <= 60 ? BatteryMedium : BatteryFull
  const left =
    pluggedIn || minutesLeft === null
      ? pluggedIn
        ? 'Plugged in'
        : 'On battery'
      : `About ${Math.floor(minutesLeft / 60)}h ${minutesLeft % 60}m left`
  return (
    <div className="sy-battery">
      <span className="section-label">Battery</span>
      <div className="sy-battery-row">
        <Icon size={22} className={percent <= 20 && !pluggedIn ? 'sy-low' : ''} />
        <span className="big-number">{percent}%</span>
      </div>
      <div className="sy-bar">
        <span className={percent <= 20 && !pluggedIn ? 'sy-low-bg' : ''} style={{ width: `${percent}%` }} />
      </div>
      <span className="muted small">{left}</span>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="sy-fact">
      <span className="muted small">{label}</span>
      <span className="sy-fact-value" title={value}>
        {value}
      </span>
    </div>
  )
}
