import { defineManifest } from '@shared/widget'

// Exercises every part of the widget API; never ships in installed builds.
export default defineManifest({ id: 'playground', name: 'Playground', order: 1000, devOnly: true })
