export interface Usage {
  used: number
  total: number
}

export interface SystemStats {
  /** Whole-machine CPU use, 0–100. */
  cpu: number
  memory: Usage
  /** The Windows drive; null if it can't be read. */
  disk: (Usage & { drive: string }) | null
  /** null on PCs without a battery. */
  battery: { percent: number; pluggedIn: boolean; minutesLeft: number | null } | null
  uptimeSec: number
  cpuModel: string
  cores: number
}

export const percentOf = ({ used, total }: Usage): number => (total > 0 ? (used / total) * 100 : 0)
