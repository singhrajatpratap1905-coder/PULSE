export interface DropFile {
  id: string
  name: string
  size: number
}

export interface DropSession {
  /** What the phone opens, e.g. http://192.168.1.20:52814/d/<token>/ */
  url: string
  /** QR code of `url` as an SVG data URL. */
  qr: string
  expiresAt: number
  files: DropFile[]
  downloads: number
}

export interface ReceivedFile {
  id: string
  name: string
  path: string
  size: number
  receivedAt: number
}

export interface DropState {
  session: DropSession | null
  received: ReceivedFile[]
  /** Why a session couldn't start (e.g. not on a network), if it couldn't. */
  error: string | null
}
