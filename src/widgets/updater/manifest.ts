import { defineManifest } from '@shared/widget'

// Keeps an installed Pulse up to date from GitHub releases. Background only; its status shows
// in Settings > About.
export default defineManifest({ id: 'updater', name: 'Updates', order: 1001, hidden: true })
