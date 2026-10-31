// Draws the Pulse app icon (a ring and dot on a black rounded square) and writes
// build/icon.png (512 px) and build/icon.ico (16–256 px). Run: node scripts/make-icon.mjs
import { mkdirSync, writeFileSync } from 'fs'
import { deflateSync } from 'zlib'

const clamp = (v) => Math.max(0, Math.min(1, v))

/** RGBA pixels of the icon at `size` px, anti-aliased analytically (no resampling). */
function render(size) {
  const px = Buffer.alloc(size * size * 4)
  const c = size / 2
  const inset = size * 0.04
  const half = c - inset
  const corner = size * 0.22
  const ringOuter = size * 0.3
  const ringInner = ringOuter - Math.max(1.2, size * 0.075)
  const dot = size * 0.1

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c
      const dy = y + 0.5 - c
      // Rounded square: signed distance to the box with rounded corners.
      const qx = Math.abs(dx) - (half - corner)
      const qy = Math.abs(dy) - (half - corner)
      const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - corner
      const body = clamp(0.5 - outside)

      const d = Math.hypot(dx, dy)
      const ring = clamp(ringOuter - d + 0.5) - clamp(ringInner - d + 0.5)
      const white = clamp(ring + clamp(dot - d + 0.5))

      const i = (y * size + x) * 4
      const v = Math.round(white * 255)
      px[i] = v
      px[i + 1] = v
      px[i + 2] = v
      px[i + 3] = Math.round(body * 255)
    }
  }
  return px
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size) {
  const rgba = render(size)
  const rows = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    rows[y * (size * 4 + 1)] = 0 // filter: none
    rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/** An .ico whose entries are PNGs, which Windows Vista and later read natively. */
function ico(sizes) {
  const images = sizes.map(png)
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(sizes.length, 4)
  let offset = 6 + 16 * sizes.length
  const entries = sizes.map((size, i) => {
    const e = Buffer.alloc(16)
    e[0] = size >= 256 ? 0 : size // 0 means 256
    e[1] = size >= 256 ? 0 : size
    e.writeUInt16LE(1, 4) // planes
    e.writeUInt16LE(32, 6) // bits per pixel
    e.writeUInt32LE(images[i].length, 8)
    e.writeUInt32LE(offset, 12)
    offset += images[i].length
    return e
  })
  return Buffer.concat([header, ...entries, ...images])
}

mkdirSync('build', { recursive: true })
writeFileSync('build/icon.png', png(512))
writeFileSync('build/icon.ico', ico([16, 24, 32, 48, 64, 128, 256]))
console.log('wrote build/icon.png and build/icon.ico')
