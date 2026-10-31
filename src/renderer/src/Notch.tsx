import { useEffect, useRef, type DragEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ACTIVITY, NOTCH, PANEL, SCENE } from '@shared/layout'
import { api } from './api'
import { usePulse } from './store'
import { Panel } from './Panel'
import { ActivityView } from './ActivityView'
import { registerNotchElement } from './drag'
import { showsScene } from './mascot/Scene'
import { WIDGETS } from './widgets/registry'

// Where dropped files go: the open page if it takes files (e.g. Phone Drop), else the first
// widget that does (the File Shelf).
const DEFAULT_FILE_TARGET = WIDGETS.find((w) => w.acceptsFiles)

function fileTarget(): string | undefined {
  const { expanded, activeTab } = usePulse.getState()
  const open = WIDGETS.find((w) => w.id === activeTab)
  return expanded && open?.acceptsFiles ? open.id : DEFAULT_FILE_TARGET?.id
}

/** Files dragged in from outside, not something Pulse itself is dragging out. */
const isIncomingFileDrag = (e: DragEvent): boolean =>
  !!DEFAULT_FILE_TARGET && e.dataTransfer.types.includes('Files') && !usePulse.getState().dragging

const spring = { type: 'spring', stiffness: 420, damping: 36, mass: 0.9 } as const

// Grace period so brushing past the edge of an open panel doesn't snap it shut.
const LEAVE_GRACE_MS = 300

export function Notch(): JSX.Element {
  const expanded = usePulse((s) => s.expanded)
  const activity = usePulse((s) => s.activity)
  const scene = usePulse((s) => showsScene(s.activity, s.mascot))
  const hoverTimer = useRef<number>()
  const leaveTimer = useRef<number>()

  useEffect(
    () => () => {
      clearTimeout(hoverTimer.current)
      clearTimeout(leaveTimer.current)
    },
    []
  )

  const onPointerEnter = (): void => {
    api.setInteractive(true)
    clearTimeout(leaveTimer.current)
    const { expanded, settings, open } = usePulse.getState()
    if (!expanded && settings?.hoverToOpen) {
      hoverTimer.current = window.setTimeout(() => open('hover'), settings.hoverDelayMs)
    }
  }

  const leave = (): void => {
    api.setInteractive(false)
    clearTimeout(hoverTimer.current)
    const { source, close } = usePulse.getState()
    if (source === 'hover') leaveTimer.current = window.setTimeout(close, LEAVE_GRACE_MS)
  }

  const onPointerLeave = (): void => {
    // A drag out of the panel cleans up in drag.ts once it drops.
    if (usePulse.getState().dragging) return
    leave()
  }

  // Files dragged onto the notch open the panel on the shelf, ready to drop.
  const onDragEnter = (e: DragEvent): void => {
    if (!isIncomingFileDrag(e)) return
    e.preventDefault()
    api.setInteractive(true)
    clearTimeout(leaveTimer.current)
    const { open, setTab } = usePulse.getState()
    const target = fileTarget()!
    usePulse.setState({ fileDragOver: true })
    setTab(target)
    open('hover')
  }

  const onDragOver = (e: DragEvent): void => {
    if (!isIncomingFileDrag(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const onDragLeave = (e: DragEvent): void => {
    // dragleave also fires when moving between child elements; only react to leaving the notch.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    if (!usePulse.getState().fileDragOver) return
    usePulse.setState({ fileDragOver: false })
    leave()
  }

  const onDrop = (e: DragEvent): void => {
    if (!isIncomingFileDrag(e)) return
    e.preventDefault()
    usePulse.setState({ fileDragOver: false })
    try {
      // Pass a plain array: handing a live FileList across the context bridge crashes the renderer.
      const paths = api.pathsForFiles(Array.from(e.dataTransfer.files))
      if (paths.length) api.widgets.call(fileTarget()!, 'dropFiles', paths)
    } catch (err) {
      console.error('[pulse] could not read dropped files:', err)
    }
  }

  const onPointerDown = (): void => {
    clearTimeout(hoverTimer.current)
    const { expanded, open, pin } = usePulse.getState()
    if (expanded) pin()
    else open('click')
  }

  const size = expanded ? PANEL : activity ? (scene ? SCENE : ACTIVITY) : NOTCH

  return (
    <motion.div
      ref={registerNotchElement}
      className="notch"
      initial={false}
      animate={{
        width: size.width,
        height: size.height,
        borderBottomLeftRadius: size.radius,
        borderBottomRightRadius: size.radius,
        boxShadow: expanded ? '0 18px 40px rgba(0, 0, 0, 0.45)' : '0 0 0 rgba(0, 0, 0, 0)'
      }}
      transition={spring}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <span className="ear ear-left" />
      <span className="ear ear-right" />
      <div className="notch-clip">
        <AnimatePresence mode="wait">
          {!expanded && activity && <ActivityView key={activity.id} activity={activity} />}
        </AnimatePresence>
        <AnimatePresence>
          {expanded && (
            <motion.div
              key="panel"
              className="panel"
              style={{ width: PANEL.width, height: PANEL.height }}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0, transition: { delay: 0.1, duration: 0.18 } }}
              exit={{ opacity: 0, transition: { duration: 0.08 } }}
            >
              <Panel />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
