// The service side of useWidgetLive: tracks who's watching and how often they want updates.

// A claim lasts this long without renewal (the UI renews every 4 s).
const CLAIM_MS = 6500

export interface LiveDemand {
  /** Record a claim: someone on screen wants updates every `intervalMs`. */
  watch(intervalMs: number): void
  /** The fastest interval anyone currently wants, or null when nobody is watching. */
  interval(): number | null
}

export function liveDemand(): LiveDemand {
  const claims = new Map<number, number>()
  return {
    watch: (intervalMs) => {
      const ms = Math.max(500, Math.round(Number(intervalMs) || 0))
      claims.set(ms, Date.now() + CLAIM_MS)
    },
    interval: () => {
      const now = Date.now()
      let fastest: number | null = null
      for (const [ms, until] of claims) {
        if (until < now) claims.delete(ms)
        else if (fastest === null || ms < fastest) fastest = ms
      }
      return fastest
    }
  }
}
