import { Link2 } from 'lucide-react'
import { defineWidgetUI } from '@renderer/widgets/sdk'
import { LinksPage } from './Page'
import { LinksCard } from './Card'
import './links.css'

export default defineWidgetUI({ icon: Link2, Page: LinksPage, Card: LinksCard })
