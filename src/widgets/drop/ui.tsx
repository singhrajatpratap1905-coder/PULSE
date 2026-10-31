import { Smartphone } from 'lucide-react'
import { defineWidgetUI } from '@renderer/widgets/sdk'
import { DropPage } from './Page'
import { DropCard } from './Card'
import './drop.css'

export default defineWidgetUI({ icon: Smartphone, Page: DropPage, Card: DropCard })
