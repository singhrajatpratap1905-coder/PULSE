import { FileStack } from 'lucide-react'
import { defineWidgetUI } from '@renderer/widgets/sdk'
import { ShelfPage } from './Page'
import { ShelfCard } from './Card'
import './shelf.css'

export default defineWidgetUI({ icon: FileStack, Page: ShelfPage, Card: ShelfCard })
