import { Target } from 'lucide-react'
import { defineWidgetUI } from '@renderer/widgets/sdk'
import { FocusPage } from './Page'
import { FocusCard } from './Card'
import './focus.css'

export default defineWidgetUI({ icon: Target, Page: FocusPage, Card: FocusCard })
