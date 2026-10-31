import { defineManifest } from '@shared/widget'

// Boo, the ghost mascot: greetings and bedtime nudges. Background only; scenes for other
// moments (focus, celebrations) are attached by the widgets those moments belong to.
export default defineManifest({ id: 'mascot', name: 'Boo', order: 1000, hidden: true })
