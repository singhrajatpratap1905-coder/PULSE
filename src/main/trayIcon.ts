import { nativeImage, type NativeImage } from 'electron'

/**
 * Draws the tray icon in code so there is no asset to ship yet: a black disc with a
 * white ring and center dot, readable on both light and dark taskbars.
 */
export function createTrayIcon(): NativeImage {
  const size = 32
  const buf = Buffer.alloc(size * size * 4)
  const c = (size - 1) / 2

  // Coverage of a filled circle of radius r at distance d, with a 1px soft edge.
  const disc = (d: number, r: number): number => Math.max(0, Math.min(1, r - d + 0.5))

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c)
      const body = disc(d, 15.5)
      const ring = disc(d, 15.5) - disc(d, 12.5)
      const dot = disc(d, 5)
      const white = Math.min(1, ring + dot)
      const v = Math.round(white * 255)
      const i = (y * size + x) * 4
      // BGRA, premultiplied.
      buf[i] = Math.round(v * body)
      buf[i + 1] = Math.round(v * body)
      buf[i + 2] = Math.round(v * body)
      buf[i + 3] = Math.round(body * 255)
    }
  }

  return nativeImage.createFromBitmap(buf, { width: size, height: size, scaleFactor: 2 })
}
