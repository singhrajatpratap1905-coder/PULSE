import koffi from 'koffi'

// Thin bindings to the few Win32 calls Electron doesn't expose. Loaded once, on first use.

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000

interface Win32 {
  GetForegroundWindow: () => unknown
  GetWindowRect: (hwnd: unknown, rect: Record<string, number>) => number
  GetClassNameW: (hwnd: unknown, buf: Buffer, max: number) => number
  SHQueryUserNotificationState: (state: number[]) => number
  GetClipboardSequenceNumber: () => number
  GetClipboardOwner: () => unknown
  RegisterClipboardFormatW: (name: string) => number
  IsClipboardFormatAvailable: (format: number) => number
  GetWindowThreadProcessId: (hwnd: unknown, pid: number[]) => number
  OpenProcess: (access: number, inherit: number, pid: number) => unknown
  QueryFullProcessImageNameW: (h: unknown, flags: number, buf: Buffer, size: number[]) => number
  CloseHandle: (h: unknown) => number
  GetSystemPowerStatus: (status: Record<string, number>) => number
}

let lib: Win32 | null | undefined

/** null when the bindings can't load; callers fall back to doing less. */
export function win32(): Win32 | null {
  if (lib !== undefined) return lib
  try {
    const user32 = koffi.load('user32.dll')
    const shell32 = koffi.load('shell32.dll')
    const kernel32 = koffi.load('kernel32.dll')
    // Registered by name; the signatures below refer to it as RECT.
    koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' })
    koffi.struct('SYSTEM_POWER_STATUS', {
      ACLineStatus: 'uint8',
      BatteryFlag: 'uint8',
      BatteryLifePercent: 'uint8',
      SystemStatusFlag: 'uint8',
      BatteryLifeTime: 'uint32',
      BatteryFullLifeTime: 'uint32'
    })
    lib = {
      GetForegroundWindow: user32.func('void* __stdcall GetForegroundWindow()'),
      GetWindowRect: user32.func('int __stdcall GetWindowRect(void* hWnd, _Out_ RECT* rect)'),
      GetClassNameW: user32.func('int __stdcall GetClassNameW(void* hWnd, _Out_ void* buf, int max)'),
      SHQueryUserNotificationState: shell32.func(
        'long __stdcall SHQueryUserNotificationState(_Out_ int* state)'
      ),
      GetClipboardSequenceNumber: user32.func('uint32 __stdcall GetClipboardSequenceNumber()'),
      GetClipboardOwner: user32.func('void* __stdcall GetClipboardOwner()'),
      RegisterClipboardFormatW: user32.func('uint32 __stdcall RegisterClipboardFormatW(str16 name)'),
      IsClipboardFormatAvailable: user32.func('int __stdcall IsClipboardFormatAvailable(uint32 format)'),
      GetWindowThreadProcessId: user32.func(
        'uint32 __stdcall GetWindowThreadProcessId(void* hWnd, _Out_ uint32* pid)'
      ),
      OpenProcess: kernel32.func('void* __stdcall OpenProcess(uint32 access, int inherit, uint32 pid)'),
      QueryFullProcessImageNameW: kernel32.func(
        'int __stdcall QueryFullProcessImageNameW(void* h, uint32 flags, _Out_ void* buf, _Inout_ uint32* size)'
      ),
      CloseHandle: kernel32.func('int __stdcall CloseHandle(void* h)'),
      GetSystemPowerStatus: kernel32.func(
        'int __stdcall GetSystemPowerStatus(_Out_ SYSTEM_POWER_STATUS* status)'
      )
    }
  } catch (err) {
    console.warn('[pulse] Win32 bindings unavailable:', err)
    lib = null
  }
  return lib
}

export function windowClassName(hwnd: unknown): string {
  const w = win32()
  if (!w || !hwnd) return ''
  const buf = Buffer.alloc(512)
  const len = w.GetClassNameW(hwnd, buf, 256)
  return buf.toString('utf16le', 0, len * 2)
}

/** Full path of the executable that owns a window, or null. */
export function processPathOfWindow(hwnd: unknown): string | null {
  const w = win32()
  if (!w || !hwnd) return null
  const pid = [0]
  w.GetWindowThreadProcessId(hwnd, pid)
  if (!pid[0]) return null
  const handle = w.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid[0])
  if (!handle) return null
  try {
    const buf = Buffer.alloc(1024)
    const size = [512]
    if (!w.QueryFullProcessImageNameW(handle, 0, buf, size)) return null
    return buf.toString('utf16le', 0, size[0] * 2)
  } finally {
    w.CloseHandle(handle)
  }
}

export interface PowerStatus {
  /** null when there is no battery (desktop PCs) or Windows can't tell. */
  percent: number | null
  /** On mains power. */
  pluggedIn: boolean
  /** Minutes left on battery, when Windows has an estimate. */
  minutesLeft: number | null
}

const NO_BATTERY_FLAG = 128
const UNKNOWN = 255
const UNKNOWN_TIME = 0xffffffff

export function powerStatus(): PowerStatus | null {
  const w = win32()
  if (!w) return null
  const s: Record<string, number> = {}
  if (!w.GetSystemPowerStatus(s)) return null
  const hasBattery = !(s.BatteryFlag & NO_BATTERY_FLAG) && s.BatteryLifePercent !== UNKNOWN
  return {
    percent: hasBattery ? s.BatteryLifePercent : null,
    pluggedIn: s.ACLineStatus === 1,
    minutesLeft: hasBattery && s.BatteryLifeTime !== UNKNOWN_TIME ? Math.round(s.BatteryLifeTime / 60) : null
  }
}

const formatIds = new Map<string, number>()

/** Whether a named (registered) clipboard format is currently on the clipboard. */
export function hasClipboardFormat(name: string): boolean {
  const w = win32()
  if (!w) return false
  let id = formatIds.get(name)
  if (id === undefined) {
    id = w.RegisterClipboardFormatW(name)
    formatIds.set(name, id)
  }
  return id !== 0 && w.IsClipboardFormatAvailable(id) !== 0
}
