import { useEffect, useId, useRef, useState } from 'react'
import { Boo, Defs, DrawingId, MusicNote, type Look } from './Scene'

// Boo in the tiny notch. Deliberately still: no looping animations, because every frame of
// Pulse's transparent always-on-top window costs CPU. It only moves when something happens:
// the pointer comes near (eyes follow, sometimes a wave), you copy something (catches a paper),
// or music plays (headphones on, bobbing along: the one ongoing animation, and only then).

// The pointer counts as "near" within this distance of the notch, in CSS pixels.
const NEAR_PX = 260
const WAVE_MS = 1400
const WAVE_COOLDOWN_MS = 25_000
// Forget where the pointer was after this long without movement (it may have left the area).
const LOOK_TIMEOUT_MS = 2500
// While music plays, Boo sways between two poses on this beat. Two poses, not a smooth CSS
// animation: Pulse draws without the GPU, and smooth motion here cost ~19% of a core; this ~4%.
const BEAT_MS = 550

/** Eye offset toward the pointer, in a few coarse steps so small moves don't redraw. */
function lookToward(dx: number, dy: number): Look {
  const clamp = (v: number): number => Math.max(-1, Math.min(1, v))
  return { x: Math.round(clamp(dx / 140) * 3), y: Math.round(clamp(dy / 90) * 2) }
}

export function MiniBoo({
  catching = false,
  vibing = false,
  height = 34
}: {
  catching?: boolean
  vibing?: boolean
  height?: number
}): JSX.Element {
  const id = `mini${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const [look, setLook] = useState<Look | null>(null)
  const [waving, setWaving] = useState(false)
  const [beat, setBeat] = useState(false)
  const near = useRef(false)
  const lastWave = useRef(0)

  useEffect(() => {
    if (catching) return
    let waveTimer: number | undefined
    let idleTimer: number | undefined

    const reset = (): void => {
      near.current = false
      setLook(null)
    }

    // Pulse's window forwards mouse moves even while click-through, so this sees the pointer
    // anywhere over the top-centre area the window covers.
    const onMove = (e: MouseEvent): void => {
      const notch = document.querySelector('.notch')
      if (!notch) return
      const r = notch.getBoundingClientRect()
      const dx = e.clientX - (r.x + r.width / 2)
      const dy = e.clientY - (r.y + r.height / 2)
      clearTimeout(idleTimer)
      if (Math.hypot(dx, dy) > NEAR_PX) {
        if (near.current) reset()
        return
      }
      idleTimer = window.setTimeout(reset, LOOK_TIMEOUT_MS)
      const next = lookToward(dx, dy)
      setLook((prev) => (prev && prev.x === next.x && prev.y === next.y ? prev : next))

      // Coming close: sometimes a little wave, never too often.
      if (!near.current) {
        near.current = true
        if (Date.now() - lastWave.current > WAVE_COOLDOWN_MS && Math.random() < 0.6) {
          lastWave.current = Date.now()
          setWaving(true)
          waveTimer = window.setTimeout(() => setWaving(false), WAVE_MS)
        }
      }
    }

    window.addEventListener('mousemove', onMove)
    document.addEventListener('mouseleave', reset)
    return () => {
      window.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', reset)
      clearTimeout(waveTimer)
      clearTimeout(idleTimer)
    }
  }, [catching])

  useEffect(() => {
    if (!vibing) return
    const timer = setInterval(() => setBeat((b) => !b), BEAT_MS)
    return () => clearInterval(timer)
  }, [vibing])

  // Boo spans x 0–100, y 0–110; extra room for a raised arm and a falling paper.
  const view = { x: -10, y: -14, w: 120, h: 126 }
  return (
    <svg
      className={`mini-boo${catching ? ' catching' : ''}`}
      width={(view.w / view.h) * height}
      height={height}
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      aria-hidden
    >
      <DrawingId.Provider value={id}>
        <Defs id={id} />
        <g transform={vibing ? (beat ? 'translate(0 2) rotate(4 50 100)' : 'rotate(-4 50 100)') : undefined}>
          <Boo
            // Eyes closed, enjoying the song, unless the pointer comes by.
            expression={catching || (vibing && !look) ? 'happy' : 'open'}
            arms={waving ? 'wave' : catching ? 'hold' : 'rest'}
            look={look ?? undefined}
            halo={false}
            headphones={vibing}
          />
        </g>
        {vibing && !catching && (
          <g opacity={beat ? 1 : 0.55}>
            <MusicNote x={beat ? 92 : 97} y={beat ? 4 : -4} size={0.9} className="note-still" />
          </g>
        )}
        {catching && <Paper />}
      </DrawingId.Provider>
    </svg>
  )
}

/**
 * The copied item: a yellow note that drifts down into Boo's raised hand, at Boo's side so it
 * stands out against Boo (white on white blurred together at this size) and leaves the face clear.
 */
function Paper(): JSX.Element {
  return (
    <g transform="translate(74 58)">
      <g className="paper">
        <rect x={0} y={0} width={30} height={34} rx={3} fill="#fcd34d" />
        <rect x={6} y={8} width={18} height={3.5} rx={1.75} fill="#92400e" opacity={0.75} />
        <rect x={6} y={15} width={13} height={3.5} rx={1.75} fill="#92400e" opacity={0.75} />
        <rect x={6} y={22} width={16} height={3.5} rx={1.75} fill="#92400e" opacity={0.75} />
      </g>
    </g>
  )
}
