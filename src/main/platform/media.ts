import koffi from 'koffi'
import type { NowPlaying } from '@shared/widget'
import { browserTabTitles, type BrowserKind } from './tabs'

// What's playing, from Windows' media controls (the panel that appears with the volume keys).
// Spotify, browsers, and most music apps report there. It's a WinRT API, called here through
// its COM vtables with koffi, so Pulse needs no native module.
//
// Only music counts, for now from Spotify and YouTube Music: a YouTube video or a call shouldn't
// set Boo dancing.

const MANAGER_CLASS = 'Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager'
const IID_MANAGER_STATICS = '2050C4EE-11A0-57DE-AED7-C97C70338245'
const IID_ASYNC_INFO = '00000036-0000-0000-C000-000000000046'

// Vtable slots. Every WinRT interface starts with IInspectable's six methods.
const QUERY_INTERFACE = 0
const RELEASE = 2
const STATICS_REQUEST_ASYNC = 6
const MANAGER_SESSIONS = 7
const VECTOR_GET_AT = 6
const VECTOR_SIZE = 7
const SESSION_APP_ID = 6
const SESSION_MEDIA_PROPERTIES_ASYNC = 7
const SESSION_PLAYBACK_INFO = 9
const PLAYBACK_INFO_STATUS = 7
const PROPERTIES_TITLE = 6
const PROPERTIES_ARTIST = 9
const ASYNC_STATUS = 7
const ASYNC_GET_RESULTS = 8

const PLAYBACK_PLAYING = 4
const ASYNC_STARTED = 0
const ASYNC_COMPLETED = 1
const ASYNC_POLL_MS = 25
const ASYNC_TIMEOUT_MS = 2000

// Music apps, by their app id in Windows' media controls (the Store and desktop Spotify, and the
// installed YouTube Music web app).
const MUSIC_APPS = /spotify|cinhimbnkkaeohfgghhklpknlkffjgod/i
const BROWSERS: Array<[RegExp, BrowserKind]> = [
  [/firefox/i, 'firefox'],
  [/chrome|msedge|brave|opera|vivaldi/i, 'chromium']
]
// A browser's media is YouTube Music when a tab is titled "<song> | YouTube Music".
const YOUTUBE_MUSIC_TAB = '| YouTube Music'
// Reading tab titles takes ~50 ms, so the answer is kept per song. A "no" is rechecked after a
// while: the tab's title can lag behind the media controls when a song starts.
const NOT_MUSIC_RECHECK_MS = 10_000

type Ptr = unknown

interface Bindings {
  getFactory: (cls: Ptr, iid: Buffer, out: Ptr[]) => number
  createString: (s: string, len: number, out: Ptr[]) => number
  deleteString: (s: Ptr) => number
  rawBuffer: (s: Ptr, len: number[]) => Ptr
  outPtr: koffi.IKoffiCType
  outInt: koffi.IKoffiCType
  getAt: koffi.IKoffiCType
  queryInterface: koffi.IKoffiCType
  release: koffi.IKoffiCType
}

let lib: Bindings | null | undefined
let manager: Ptr = null

function bindings(): Bindings | null {
  if (lib !== undefined) return lib
  try {
    const combase = koffi.load('combase.dll')
    lib = {
      getFactory: combase.func('long __stdcall RoGetActivationFactory(void* cls, void* iid, _Out_ void** out)'),
      createString: combase.func('long __stdcall WindowsCreateString(str16 s, uint32 len, _Out_ void** out)'),
      deleteString: combase.func('long __stdcall WindowsDeleteString(void* s)'),
      rawBuffer: combase.func('void* __stdcall WindowsGetStringRawBuffer(void* s, _Out_ uint32* len)'),
      outPtr: koffi.proto('long __stdcall MediaOutPtr(void* self, _Out_ void** out)'),
      outInt: koffi.proto('long __stdcall MediaOutInt(void* self, _Out_ int* out)'),
      getAt: koffi.proto('long __stdcall MediaGetAt(void* self, uint32 index, _Out_ void** out)'),
      queryInterface: koffi.proto('long __stdcall MediaQueryInterface(void* self, void* iid, _Out_ void** out)'),
      release: koffi.proto('uint32 __stdcall MediaRelease(void* self)')
    }
  } catch (err) {
    console.warn('[pulse] media session bindings unavailable:', err)
    lib = null
  }
  return lib
}

function guid(text: string): Buffer {
  const hex = text.replace(/-/g, '')
  const b = Buffer.alloc(16)
  b.writeUInt32LE(parseInt(hex.slice(0, 8), 16), 0)
  b.writeUInt16LE(parseInt(hex.slice(8, 12), 16), 4)
  b.writeUInt16LE(parseInt(hex.slice(12, 16), 16), 6)
  Buffer.from(hex.slice(16), 'hex').copy(b, 8)
  return b
}

const method = (obj: Ptr, slot: number): Ptr => koffi.decode(koffi.decode(obj, 'void*'), slot * 8, 'void*')

function check(hr: number, what: string): void {
  if (hr < 0) throw new Error(`${what} failed (0x${(hr >>> 0).toString(16)})`)
}

function getPtr(l: Bindings, obj: Ptr, slot: number): Ptr {
  const out: Ptr[] = [null]
  check(koffi.call(method(obj, slot), l.outPtr, obj, out), `call ${slot}`)
  return out[0]
}

function getInt(l: Bindings, obj: Ptr, slot: number): number {
  const out = [0]
  check(koffi.call(method(obj, slot), l.outInt, obj, out), `call ${slot}`)
  return out[0]
}

function release(l: Bindings, obj: Ptr): void {
  if (obj) koffi.call(method(obj, RELEASE), l.release, obj)
}

/** Reads an HSTRING and frees it. */
function takeString(l: Bindings, h: Ptr): string {
  if (!h) return ''
  try {
    const len = [0]
    const p = l.rawBuffer(h, len)
    return len[0] ? (koffi.decode(p, koffi.array('char16_t', len[0], 'String')) as string) : ''
  } finally {
    l.deleteString(h)
  }
}

/** Waits for a WinRT IAsyncOperation and returns its result; releases the operation. */
async function settle(l: Bindings, op: Ptr): Promise<Ptr> {
  const info: Ptr[] = [null]
  try {
    check(koffi.call(method(op, QUERY_INTERFACE), l.queryInterface, op, guid(IID_ASYNC_INFO), info), 'IAsyncInfo')
    const deadline = Date.now() + ASYNC_TIMEOUT_MS
    let status = getInt(l, info[0], ASYNC_STATUS)
    while (status === ASYNC_STARTED && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, ASYNC_POLL_MS))
      status = getInt(l, info[0], ASYNC_STATUS)
    }
    if (status !== ASYNC_COMPLETED) throw new Error(`async operation ended with status ${status}`)
    return getPtr(l, op, ASYNC_GET_RESULTS)
  } finally {
    release(l, info[0])
    release(l, op)
  }
}

async function sessionManager(l: Bindings): Promise<Ptr> {
  if (manager) return manager
  const name: Ptr[] = [null]
  check(l.createString(MANAGER_CLASS, MANAGER_CLASS.length, name), 'WindowsCreateString')
  const factory: Ptr[] = [null]
  try {
    check(l.getFactory(name[0], guid(IID_MANAGER_STATICS), factory), 'RoGetActivationFactory')
    manager = await settle(l, getPtr(l, factory[0], STATICS_REQUEST_ASYNC))
    return manager
  } finally {
    release(l, factory[0])
    l.deleteString(name[0])
  }
}

const browserVerdicts = new Map<string, { music: boolean; at: number }>()

/** Whether a browser's media with this title is coming from a YouTube Music tab. */
function isYouTubeMusicTab(kind: BrowserKind, title: string): boolean {
  const key = `${kind}\n${title}`
  const known = browserVerdicts.get(key)
  if (known && (known.music || Date.now() - known.at < NOT_MUSIC_RECHECK_MS)) return known.music
  const music = browserTabTitles(kind).some((tab) => tab.includes(YOUTUBE_MUSIC_TAB) && tab.includes(title))
  // Keep only the latest few songs.
  if (browserVerdicts.size > 20) browserVerdicts.clear()
  browserVerdicts.set(key, { music, at: Date.now() })
  return music
}

async function readSession(l: Bindings, session: Ptr): Promise<NowPlaying | null> {
  const app = takeString(l, getPtr(l, session, SESSION_APP_ID))
  const browser = BROWSERS.find(([pattern]) => pattern.test(app))?.[1]
  if (!browser && !MUSIC_APPS.test(app)) return null
  const info = getPtr(l, session, SESSION_PLAYBACK_INFO)
  try {
    if (getInt(l, info, PLAYBACK_INFO_STATUS) !== PLAYBACK_PLAYING) return null
  } finally {
    release(l, info)
  }
  const props = await settle(l, getPtr(l, session, SESSION_MEDIA_PROPERTIES_ASYNC))
  let song: NowPlaying
  try {
    song = {
      playing: true,
      title: takeString(l, getPtr(l, props, PROPERTIES_TITLE)),
      artist: takeString(l, getPtr(l, props, PROPERTIES_ARTIST))
    }
  } finally {
    release(l, props)
  }
  if (browser && !(song.title && isYouTubeMusicTab(browser, song.title))) return null
  return song
}

/**
 * The music playing in Spotify or YouTube Music, if any. Looks at every app with media, not just
 * the one Windows shows, so a paused video elsewhere doesn't hide a playing song. null when no
 * music plays or the API isn't available.
 */
export async function nowPlaying(): Promise<NowPlaying | null> {
  const l = bindings()
  if (!l) return null
  const mgr = await sessionManager(l)
  const sessions = getPtr(l, mgr, MANAGER_SESSIONS)
  try {
    const count = getInt(l, sessions, VECTOR_SIZE)
    for (let i = 0; i < count; i++) {
      const out: Ptr[] = [null]
      if (koffi.call(method(sessions, VECTOR_GET_AT), l.getAt, sessions, i, out) < 0 || !out[0]) continue
      try {
        const song = await readSession(l, out[0])
        if (song) return song
      } finally {
        release(l, out[0])
      }
    }
    return null
  } finally {
    release(l, sessions)
  }
}