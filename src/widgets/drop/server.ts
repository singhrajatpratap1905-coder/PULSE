import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { createReadStream, createWriteStream, existsSync, mkdirSync, rmSync, statSync } from 'fs'
import { networkInterfaces } from 'os'
import { basename, extname, join } from 'path'
import { randomBytes, timingSafeEqual } from 'crypto'
import { pipeline } from 'stream/promises'
import { mobilePage } from './mobilePage'

export const MAX_UPLOAD_BYTES = 4 * 1024 ** 3

// Adapters that look like a LAN but that a phone can't reach.
const VIRTUAL_ADAPTER = /vethernet|virtualbox|vmware|hyper-v|wsl|loopback|docker|tailscale|zerotier|vpn/i

const isPrivate = (ip: string): boolean =>
  /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)

/** The PC's address on the local network (Wi-Fi or Ethernet), or null if it isn't on one. */
export function lanAddress(): string | null {
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    if (VIRTUAL_ADAPTER.test(name)) continue
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal && isPrivate(a.address)) return a.address
    }
  }
  return null
}

/** Strips anything a phone could put in a file name that isn't safe on Windows. */
export function safeFileName(raw: string): string {
  const cleaned = basename(raw.replace(/\\/g, '/'))
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 150)
  return /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(cleaned) || !cleaned ? `file_${Date.now()}` : cleaned
}

/** `name.ext`, or `name (2).ext` etc. if it already exists in `dir`. */
function uniquePath(dir: string, name: string): string {
  const ext = extname(name)
  const stem = name.slice(0, name.length - ext.length)
  let candidate = join(dir, name)
  for (let n = 2; existsSync(candidate); n++) candidate = join(dir, `${stem} (${n})${ext}`)
  return candidate
}

export interface ServedFile {
  id: string
  name: string
  path: string
  size: number
}

export interface DropServerOptions {
  host: string
  files: () => ServedFile[]
  receiveDir: string
  onDownload: (file: ServedFile) => void
  onReceive: (file: { name: string; path: string; size: number }) => void
}

export interface DropServer {
  url: string
  close: () => void
}

/**
 * A short-lived HTTP server for one Phone Drop session. Every route sits under a random
 * 128-bit token; anything else is a 404. Phones get a page to download the chosen files and to
 * upload files back, which land in `receiveDir`.
 */
export async function startDropServer(opts: DropServerOptions): Promise<DropServer> {
  const token = randomBytes(16).toString('hex')
  const tokenBuf = Buffer.from(token)
  const validToken = (t: string): boolean => {
    const b = Buffer.from(t)
    return b.length === tokenBuf.length && timingSafeEqual(b, tokenBuf)
  }

  const notFound = (res: ServerResponse): void => {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found')
  }

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://drop')
    const [, d, t, action, arg] = url.pathname.split('/')
    if (d !== 'd' || !t || !validToken(t)) return notFound(res)

    // The page: GET /d/<token>/
    if (req.method === 'GET' && !action) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
        'Referrer-Policy': 'no-referrer'
      })
      res.end(mobilePage(opts.files().map(({ id, name, size }) => ({ id, name, size }))))
      return
    }

    // A download: GET /d/<token>/f/<id>
    if (req.method === 'GET' && action === 'f' && arg) {
      const file = opts.files().find((f) => f.id === arg)
      if (!file || !existsSync(file.path)) return notFound(res)
      const size = statSync(file.path).size
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': size,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        'Cache-Control': 'no-store'
      })
      await pipeline(createReadStream(file.path), res)
      opts.onDownload(file)
      return
    }

    // An upload: PUT /d/<token>/upload?name=<file name>, raw file as the body.
    if (req.method === 'PUT' && action === 'upload') {
      const declared = Number(req.headers['content-length'] ?? 0)
      if (declared > MAX_UPLOAD_BYTES) {
        res.writeHead(413).end('Too large')
        return
      }
      mkdirSync(opts.receiveDir, { recursive: true })
      const name = safeFileName(url.searchParams.get('name') ?? 'file')
      const path = uniquePath(opts.receiveDir, name)
      let size = 0
      req.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > MAX_UPLOAD_BYTES) req.destroy(new Error('Too large'))
      })
      try {
        await pipeline(req, createWriteStream(path))
      } catch {
        rmSync(path, { force: true })
        if (!res.headersSent) res.writeHead(400).end('Upload failed')
        return
      }
      opts.onReceive({ name: basename(path), path, size })
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, name: basename(path) }))
      return
    }

    notFound(res)
  }

  const server: Server = createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500).end('Error')
      else res.destroy()
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, opts.host, () => resolve())
  })
  const { port } = server.address() as { port: number }

  return {
    url: `http://${opts.host}:${port}/d/${token}/`,
    close: () => {
      server.close()
      server.closeAllConnections()
    }
  }
}
