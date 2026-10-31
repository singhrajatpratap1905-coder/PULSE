import { Gauge as GaugeIcon } from 'lucide-react'
import { defineWidgetUI } from '@renderer/widgets/sdk'
import { SystemPage } from './Page'
import { SystemCard } from './Card'
import './system.css'

export default defineWidgetUI({ icon: GaugeIcon, Page: SystemPage, Card: SystemCard })
