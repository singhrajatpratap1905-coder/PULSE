import { Timer } from 'lucide-react'
import { defineWidgetUI } from '@renderer/widgets/sdk'
import { TimersPage } from './Page'
import { TimersCard } from './Card'
import './timers.css'

export default defineWidgetUI({ icon: Timer, Page: TimersPage, Card: TimersCard })
