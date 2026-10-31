/// <reference types="vite/client" />
import type { PulseApi } from '@shared/types'

declare global {
  interface Window {
    pulse?: PulseApi
  }
}
