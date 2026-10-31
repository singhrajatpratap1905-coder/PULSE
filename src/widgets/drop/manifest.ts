import { defineManifest } from '@shared/widget'

// acceptsFiles: files dragged onto Pulse while this page is open are shared, not shelved.
export default defineManifest({ id: 'drop', name: 'Phone Drop', order: 35, acceptsFiles: true })
