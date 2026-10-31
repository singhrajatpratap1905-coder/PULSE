import type { DragEvent } from 'react'
import { api } from './api'
import { usePulse } from './store'

// While something is dragged out of the panel, the pointer leaving it must not close it
// or make the window click-through. Once the drop lands, we check where the cursor ended up.

let notchEl: HTMLElement | null = null

export const registerNotchElement = (el: HTMLElement | null): void => {
  notchEl = el
}

function beginDrag(): void {
  usePulse.setState({ dragging: true })
}

async function endDrag(): Promise<void> {
  const { x, y } = await api.getCursor()
  usePulse.setState({ dragging: false })
  const r = notchEl?.getBoundingClientRect()
  const inside = !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
  if (inside) return
  api.setInteractive(false)
  const { source, close } = usePulse.getState()
  if (source === 'hover') close()
}

interface DragProps {
  draggable: true
  onDragStart: (e: DragEvent) => void
  onDragEnd?: () => void
}

/** Drag text (and optionally a link) into any app that accepts dropped text. */
export function textDragProps(text: string, url?: string): DragProps {
  return {
    draggable: true,
    onDragStart: (e) => {
      beginDrag()
      e.dataTransfer.effectAllowed = 'copy'
      e.dataTransfer.setData('text/plain', text)
      if (url) e.dataTransfer.setData('text/uri-list', url)
    },
    onDragEnd: () => void endDrag()
  }
}

/** Drag a real file from a widget's dataDir, e.g. into Explorer, chat apps or editors. */
export function fileDragProps(widgetId: string, relPath: string): DragProps {
  return {
    draggable: true,
    onDragStart: (e) => {
      // Hand the drag to the OS so the drop receives an actual file.
      e.preventDefault()
      beginDrag()
      api.widgets.startDrag(widgetId, relPath).finally(() => void endDrag())
    }
  }
}
