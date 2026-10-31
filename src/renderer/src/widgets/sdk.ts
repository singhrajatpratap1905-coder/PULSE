// What widget ui.tsx files import to talk to their service and describe their UI.
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'
import { api } from '../api'

export { fileDragProps, textDragProps } from '../drag'

export interface WidgetUI {
  icon: LucideIcon
  /** Full view, shown when the widget is picked in the dock. */
  Page: ComponentType
  /** Compact tile for Home. Widgets without one get a placeholder tile. */
  Card?: ComponentType
}

export const defineWidgetUI = (ui: WidgetUI): WidgetUI => ui

export interface WidgetBridge {
  call<T = unknown>(method: string, ...args: unknown[]): Promise<T>
}

/** Calls methods the widget's service registered with `ctx.handle`. */
export function useWidget(widgetId: string): WidgetBridge {
  return useMemo(
    () => ({
      call: <T,>(method: string, ...args: unknown[]) =>
        api.widgets.call(widgetId, method, ...args) as Promise<T>
    }),
    [widgetId]
  )
}

/** Runs `cb` whenever the widget's service calls `ctx.emit(event, payload)`. */
export function useWidgetEvent<T>(widgetId: string, event: string, cb: (payload: T) => void): void {
  const latest = useRef(cb)
  latest.current = cb
  useEffect(
    () => api.widgets.on(widgetId, event, (payload) => latest.current(payload as T)),
    [widgetId, event]
  )
}

/**
 * A value owned by the service: loaded once with `getter`, then kept current by `event`.
 * Returns `initial` until the first load finishes.
 */
export function useWidgetValue<T>(widgetId: string, getter: string, event: string, initial: T): T {
  const [value, setValue] = useState<T>(initial)
  const { call } = useWidget(widgetId)
  useEffect(() => {
    call<T>(getter).then(setValue, (err) => console.warn(`[pulse] ${widgetId}.${getter}:`, err))
  }, [call, getter, widgetId])
  useWidgetEvent<T>(widgetId, event, setValue)
  return value
}
