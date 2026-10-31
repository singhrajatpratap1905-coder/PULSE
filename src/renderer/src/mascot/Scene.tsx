import { createContext, useContext, useEffect, useId, useRef } from 'react'
import type { Activity, MascotPrefs, MascotScene } from '@shared/widget'
import { api } from '../api'
import './mascot.css'

// The id prefix of the drawing being rendered, for its gradient references.
export const DrawingId = createContext('boo')

/** Where Boo is looking, as a small offset of the eyes (in drawing units, about ±3). */
export interface Look {
  x: number
  y: number
}

// Boo, Pulse's ghost mascot, drawn as smooth SVG and animated with CSS (see mascot.css).
// Boo's own drawing spans x 0–100, y 0–110; props sit to its right.

/** Whether an activity should be shown as a full-size mascot scene under the user's settings. */
export function showsScene(activity: Activity | null, prefs: MascotPrefs | null): boolean {
  // The catch scene only exists in the tiny notch (see MiniBoo).
  if (!activity?.scene || activity.scene === 'catch' || !prefs?.enabled) return false
  return activity.moment ? prefs.moments[activity.moment] : true
}

/** Whether Boo lives in a tiny notch when Pulse is idle. */
export const tinyNotch = (prefs: MascotPrefs | null): boolean => !!prefs?.enabled && prefs.notch !== false

type FullScene = Exclude<MascotScene, 'catch'>

export type Expression = 'open' | 'happy' | 'sleepy'
export type Arms = 'rest' | 'wave' | 'type' | 'hold'

const INK = '#1c1917'

// Three tails along the bottom, curving up between them.
const BODY_PATH =
  'M12,44 A38,38 0 0 1 88,44 L88,98 Q75.3,84 62.7,98 Q50,84 37.3,98 Q24.7,84 12,98 Z'

function Eyes({ expression, look }: { expression: Expression; look?: Look }): JSX.Element {
  if (expression === 'happy') {
    return (
      <g fill="none" stroke={INK} strokeWidth={3.6} strokeLinecap="round">
        <path d="M31,50 Q37,41 43,50" />
        <path d="M57,50 Q63,41 69,50" />
      </g>
    )
  }
  if (expression === 'sleepy') {
    return (
      <g fill="none" stroke={INK} strokeWidth={3.6} strokeLinecap="round">
        <path d="M31,47 Q37,53 43,47" />
        <path d="M57,47 Q63,53 69,47" />
      </g>
    )
  }
  return (
    // Looking is an SVG transform on an outer group, so it never fights the blink animation.
    <g transform={look ? `translate(${look.x} ${look.y})` : undefined}>
      <g className="boo-eyes">
        <ellipse cx={37} cy={47} rx={6.5} ry={9.5} fill={INK} />
        <ellipse cx={63} cy={47} rx={6.5} ry={9.5} fill={INK} />
        <circle cx={38.6} cy={43.2} r={2.1} fill="#fff" />
        <circle cx={64.6} cy={43.2} r={2.1} fill="#fff" />
      </g>
    </g>
  )
}

function Mouth({ expression }: { expression: Expression }): JSX.Element {
  if (expression === 'happy') return <path d="M44,58 Q50,67 56,58 Z" fill={INK} />
  if (expression === 'sleepy') return <ellipse cx={50} cy={61} rx={3} ry={2.2} fill={INK} />
  return <ellipse cx={50} cy={60} rx={4} ry={3.2} fill={INK} />
}

/** Boo itself. Arms are small rounded nubs on each side; a soft halo sits behind. */
export function Boo({
  expression,
  arms,
  className = '',
  look,
  halo = true
}: {
  expression: Expression
  arms: Arms
  className?: string
  look?: Look
  halo?: boolean
}): JSX.Element {
  const id = useContext(DrawingId)
  const fill = `url(#${id}-fill)`
  return (
    <g className={`boo ${className}`}>
      {halo && <ellipse cx={50} cy={64} rx={60} ry={58} fill={`url(#${id}-glow)`} />}
      <ellipse className={`boo-arm boo-arm-left arms-${arms}`} cx={11} cy={68} rx={6} ry={8} fill={fill} />
      <ellipse className={`boo-arm boo-arm-right arms-${arms}`} cx={89} cy={68} rx={6} ry={8} fill={fill} />
      <path d={BODY_PATH} fill={fill} />
      <Eyes expression={expression} look={look} />
      <ellipse cx={25} cy={60} rx={5.5} ry={3} fill="#fb7185" opacity={0.85} />
      <ellipse cx={75} cy={60} rx={5.5} ry={3} fill="#fb7185" opacity={0.85} />
      <Mouth expression={expression} />
    </g>
  )
}

// Gradient ids must be unique per drawing: with several Boos on screen at once (Settings and
// the notch), a shared id can resolve to a copy that's being removed, leaving Boo unpainted.
export function Defs({ id }: { id: string }): JSX.Element {
  return (
    <defs>
      <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0.45" stopColor="#f5f5f4" />
        <stop offset="1" stopColor="#d9d5ec" />
      </linearGradient>
      <radialGradient id={`${id}-glow`}>
        <stop offset="0.55" stopColor="#c4b5fd" stopOpacity={0.3} />
        <stop offset="1" stopColor="#c4b5fd" stopOpacity={0} />
      </radialGradient>
    </defs>
  )
}

function Laptop(): JSX.Element {
  return (
    <g transform="translate(104 54)">
      <rect x={0} y={0} width={44} height={32} rx={3.5} fill="#a3a3a3" />
      <rect x={3} y={3} width={38} height={26} rx={2} fill="#38bdf8" />
      <rect className="typed-line typed-1" x={7} y={8} width={22} height={3} rx={1.5} fill="#e0f2fe" />
      <rect className="typed-line typed-2" x={7} y={14} width={28} height={3} rx={1.5} fill="#e0f2fe" />
      <rect className="typed-line typed-3" x={7} y={20} width={16} height={3} rx={1.5} fill="#e0f2fe" />
      <rect x={-6} y={32} width={56} height={5} rx={2.5} fill="#78716c" />
    </g>
  )
}

// Props are placed by an outer <g transform>; animations go on an inner element, because a CSS
// animation's transform replaces the SVG transform attribute on the same element.

function Mug(): JSX.Element {
  return (
    <g transform="translate(100 62)">
      <g className="mug">
        <path className="steam steam-1" d="M8,-6 q-4,-5 0,-10 q4,-5 0,-10" fill="none" stroke="#d6d3d1" strokeWidth={2.4} strokeLinecap="round" />
        <path className="steam steam-2" d="M16,-6 q-4,-5 0,-10 q4,-5 0,-10" fill="none" stroke="#d6d3d1" strokeWidth={2.4} strokeLinecap="round" />
        <circle cx={25} cy={12} r={6.5} fill="none" stroke="#fcd34d" strokeWidth={4} />
        <rect x={0} y={0} width={25} height={26} rx={5} fill="#fcd34d" />
        <ellipse cx={12.5} cy={3} rx={10} ry={2.6} fill="#78350f" />
      </g>
    </g>
  )
}

function Sparkle({ x, y, size, className }: { x: number; y: number; size: number; className: string }): JSX.Element {
  const s = size
  return (
    <g transform={`translate(${x} ${y})`}>
      <path
        className={`sparkle ${className}`}
        d={`M0,${-s} Q${s * 0.18},${-s * 0.18} ${s},0 Q${s * 0.18},${s * 0.18} 0,${s} Q${-s * 0.18},${s * 0.18} ${-s},0 Q${-s * 0.18},${-s * 0.18} 0,${-s} Z`}
        fill="#fde047"
      />
    </g>
  )
}

function Zs(): JSX.Element {
  return (
    <g fill="#c7d2fe" fontFamily="'Segoe UI Variable Display','Segoe UI',sans-serif" fontWeight={800}>
      <text className="z z-1" x={92} y={44} fontSize={26}>z</text>
      <text className="z z-2" x={106} y={26} fontSize={19}>z</text>
    </g>
  )
}

// How each scene looks: Boo's pose, props, and the drawing's width.
const SCENES: Record<FullScene, { width: number; draw: () => JSX.Element }> = {
  wave: {
    width: 112,
    draw: () => <Boo expression="open" arms="wave" className="float" />
  },
  typing: {
    width: 156,
    draw: () => (
      <>
        <Boo expression="open" arms="type" className="float-slow" />
        <Laptop />
      </>
    )
  },
  coffee: {
    width: 134,
    draw: () => (
      <g className="sipping">
        <Boo expression="happy" arms="hold" className="float-slow" />
        <Mug />
      </g>
    )
  },
  celebrate: {
    width: 128,
    draw: () => (
      <>
        <Sparkle x={2} y={30} size={11} className="sparkle-1" />
        <Sparkle x={112} y={14} size={14} className="sparkle-2" />
        <Sparkle x={118} y={62} size={10} className="sparkle-3" />
        <Boo expression="happy" arms="wave" className="jump" />
      </>
    )
  },
  sleepy: {
    width: 122,
    draw: () => (
      <>
        <Boo expression="sleepy" arms="rest" className="doze" />
        <Zs />
      </>
    )
  }
}

/** Boo acting out a scene, `height` px tall. */
export function SceneArt({ scene, height = 54 }: { scene: FullScene; height?: number }): JSX.Element {
  const { width, draw } = SCENES[scene]
  // useId returns ":r1:"-style ids; colons aren't valid inside url(#...) references.
  const id = `boo${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const ref = useRef<SVGSVGElement>(null)

  // Record where Boo was actually drawn, to trace "Boo doesn't show" reports.
  useEffect(() => {
    const r = ref.current?.getBoundingClientRect()
    if (r) api.log(`Boo drawn (${scene}): ${Math.round(r.width)}x${Math.round(r.height)} at ${Math.round(r.x)},${Math.round(r.y)}`)
  }, [scene])
  // Extra room above for floating, jumping and drifting z's.
  const top = -10
  const viewHeight = 112 - top
  return (
    <svg
      ref={ref}
      className={`scene-art scene-${scene}`}
      width={(width / viewHeight) * height}
      height={height}
      viewBox={`0 ${top} ${width} ${viewHeight}`}
      aria-hidden
    >
      <DrawingId.Provider value={id}>
        <Defs id={id} />
        {draw()}
      </DrawingId.Provider>
    </svg>
  )
}
