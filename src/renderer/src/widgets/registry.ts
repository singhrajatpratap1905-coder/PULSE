import type { WidgetManifest } from '@shared/widget'
import type { WidgetUI } from './sdk'

export interface RegisteredWidget extends WidgetManifest, WidgetUI {}

// Found at build time: every src/widgets/<id>/manifest.ts and ui.tsx.
const manifests = import.meta.glob<WidgetManifest>('../../../widgets/*/manifest.ts', {
  eager: true,
  import: 'default'
})
const uis = import.meta.glob<WidgetUI>('../../../widgets/*/ui.tsx', {
  eager: true,
  import: 'default'
})

const folderOf = (path: string): string => path.split('/').at(-2)!

export const WIDGETS: RegisteredWidget[] = Object.entries(manifests)
  .flatMap(([path, manifest]) => {
    const folder = folderOf(path)
    if (manifest.id !== folder) {
      console.warn(`[pulse] widget folder "${folder}" declares id "${manifest.id}"; skipping`)
      return []
    }
    if (manifest.devOnly && !import.meta.env.DEV) return []
    // Background-only widgets (e.g. the mascot) have a service but nothing in the dock.
    if (manifest.hidden) return []
    const ui = uis[path.replace(/manifest\.ts$/, 'ui.tsx')]
    if (!ui) {
      console.warn(`[pulse] widget "${manifest.id}" has no ui.tsx; skipping`)
      return []
    }
    return [{ ...manifest, ...ui }]
  })
  .sort((a, b) => a.order - b.order)

export const widgetById = (id: string): RegisteredWidget | undefined =>
  WIDGETS.find((w) => w.id === id)
