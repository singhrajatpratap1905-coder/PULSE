import { Hourglass } from 'lucide-react'
import { defineWidgetUI } from '@renderer/widgets/sdk'
import { ScreenTimePage } from './Page'
import { ScreenTimeCard } from './Card'
import './screentime.css'

export default defineWidgetUI({ icon: Hourglass, Page: ScreenTimePage, Card: ScreenTimeCard })
