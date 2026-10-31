import { NotebookPen } from 'lucide-react'
import { defineWidgetUI } from '@renderer/widgets/sdk'
import { NotesPage } from './Page'
import { NotesCard } from './Card'
import './notes.css'

export default defineWidgetUI({ icon: NotebookPen, Page: NotesPage, Card: NotesCard })
