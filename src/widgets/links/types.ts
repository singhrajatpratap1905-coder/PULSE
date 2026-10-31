export interface Link {
  id: string
  title: string
  url: string
  createdAt: number
  /** How often it was opened from Pulse; the most used float to the top. */
  opens: number
}

export interface SearchEngine {
  id: string
  name: string
  /** `{q}` is replaced with the encoded query. */
  template: string
}

export const ENGINES: SearchEngine[] = [
  { id: 'google', name: 'Google', template: 'https://www.google.com/search?q={q}' },
  { id: 'youtube', name: 'YouTube', template: 'https://www.youtube.com/results?search_query={q}' },
  { id: 'github', name: 'GitHub', template: 'https://github.com/search?q={q}' },
  { id: 'stackoverflow', name: 'Stack Overflow', template: 'https://stackoverflow.com/search?q={q}' },
  { id: 'wikipedia', name: 'Wikipedia', template: 'https://en.wikipedia.org/w/index.php?search={q}' },
  { id: 'claude', name: 'Claude', template: 'https://claude.ai/new?q={q}' }
]

/** "example.com/path" → "https://example.com/path"; null unless it ends up a web address. */
export function normalizeUrl(input: string): string | null {
  const raw = input.trim()
  if (!raw || /\s/.test(raw)) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    // A bare word like "hello" isn't a site; require a dot or localhost.
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null
    return url.toString()
  } catch {
    return null
  }
}

export const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
