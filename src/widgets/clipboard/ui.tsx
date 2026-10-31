import { Clipboard } from 'lucide-react'
import { defineWidgetUI } from '@renderer/widgets/sdk'
import { ClipboardPage } from './Page'
import { ClipboardCard } from './Card'
import './clipboard.css'

export default defineWidgetUI({ icon: Clipboard, Page: ClipboardPage, Card: ClipboardCard })
