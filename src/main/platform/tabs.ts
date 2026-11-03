import koffi from 'koffi'
import { processPathOfWindow } from './win32'

// Browser tab titles, read through UI Automation (the accessibility API screen readers use), so
// Pulse can tell which site a browser's media comes from: Windows' media controls only say
// "Firefox" or "Chrome". Called through UIA's COM vtables with koffi. Takes ~50 ms per browser
// window, so callers ask rarely (see media.ts).

const CLSID_CUI_AUTOMATION = 'FF48DBA4-60EF-4201-AA87-54103EEF594E'
const IID_IUI_AUTOMATION = '30CBE57D-D9D0-452A-AB13-7AC5AC4825EE'
const CLSCTX_INPROC_SERVER = 1
const COINIT_APARTMENTTHREADED = 2

// Vtable slots (IUnknown's three methods come first).
const RELEASE = 2
const AUTOMATION_ELEMENT_FROM_HANDLE = 6
const AUTOMATION_CREATE_PROPERTY_CONDITION = 23
const ELEMENT_FIND_ALL = 6
const ELEMENT_CURRENT_NAME = 23
const ARRAY_LENGTH = 3
const ARRAY_GET_ELEMENT = 4

const UIA_CONTROL_TYPE_PROPERTY = 30003
const UIA_TAB_ITEM_CONTROL_TYPE = 50019
const TREE_SCOPE_DESCENDANTS = 4
const VT_I4 = 3

export type BrowserKind = 'firefox' | 'chromium'

// Firefox's top-level windows have their own class; Chromium browsers share theirs with every
// Electron app, so those are told apart by their executable.
const WINDOW_CLASS: Record<BrowserKind, string> = { firefox: 'MozillaWindowClass', chromium: 'Chrome_WidgetWin_1' }
const CHROMIUM_EXE = /\\(chrome|msedge|brave|opera|vivaldi)\.exe$/i

type Ptr = unknown

interface Bindings {
  findWindow: (parent: Ptr, after: Ptr, cls: string, title: string | null) => Ptr
  stringLength: (s: Ptr) => number
  freeString: (s: Ptr) => void
  fromHandle: koffi.IKoffiCType
  propertyCondition: koffi.IKoffiCType
  findAll: koffi.IKoffiCType
  outInt: koffi.IKoffiCType
  outPtr: koffi.IKoffiCType
  getAt: koffi.IKoffiCType
  release: koffi.IKoffiCType
  automation: Ptr
  tabCondition: Ptr
}

let lib: Bindings | null | undefined

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

function bindings(): Bindings | null {
  if (lib !== undefined) return lib
  try {
    const ole32 = koffi.load('ole32.dll')
    const oleaut32 = koffi.load('oleaut32.dll')
    const user32 = koffi.load('user32.dll')
    const partial = {
      findWindow: user32.func('void* __stdcall FindWindowExW(void* parent, void* after, str16 cls, str16 title)'),
      stringLength: oleaut32.func('uint32 __stdcall SysStringLen(void* s)'),
      freeString: oleaut32.func('void __stdcall SysFreeString(void* s)'),
      fromHandle: koffi.proto('long __stdcall UiaElementFromHandle(void* self, void* hwnd, _Out_ void** out)'),
      // A VARIANT is 24 bytes, so the x64 calling convention passes it by pointer.
      propertyCondition: koffi.proto('long __stdcall UiaPropertyCondition(void* self, int id, void* value, _Out_ void** out)'),
      findAll: koffi.proto('long __stdcall UiaFindAll(void* self, int scope, void* cond, _Out_ void** out)'),
      outInt: koffi.proto('long __stdcall UiaOutInt(void* self, _Out_ int* out)'),
      outPtr: koffi.proto('long __stdcall UiaOutPtr(void* self, _Out_ void** out)'),
      getAt: koffi.proto('long __stdcall UiaGetElement(void* self, int i, _Out_ void** out)'),
      release: koffi.proto('uint32 __stdcall UiaRelease(void* self)')
    }
    // Already initialised on Electron's main thread; this just makes sure.
    ole32.func('long __stdcall CoInitializeEx(void* reserved, uint32 flags)')(null, COINIT_APARTMENTTHREADED)
    const create = ole32.func(
      'long __stdcall CoCreateInstance(void* clsid, void* outer, uint32 ctx, void* iid, _Out_ void** out)'
    )
    const automation: Ptr[] = [null]
    check(create(guid(CLSID_CUI_AUTOMATION), null, CLSCTX_INPROC_SERVER, guid(IID_IUI_AUTOMATION), automation), 'CoCreateInstance')
    const variant = Buffer.alloc(24)
    variant.writeUInt16LE(VT_I4, 0)
    variant.writeInt32LE(UIA_TAB_ITEM_CONTROL_TYPE, 8)
    const condition: Ptr[] = [null]
    check(
      koffi.call(
        method(automation[0], AUTOMATION_CREATE_PROPERTY_CONDITION),
        partial.propertyCondition,
        automation[0],
        UIA_CONTROL_TYPE_PROPERTY,
        variant,
        condition
      ),
      'CreatePropertyCondition'
    )
    lib = { ...partial, automation: automation[0], tabCondition: condition[0] }
  } catch (err) {
    console.warn('[pulse] UI Automation unavailable:', err)
    lib = null
  }
  return lib
}

function check(hr: number, what: string): void {
  if (hr < 0) throw new Error(`${what} failed (0x${(hr >>> 0).toString(16)})`)
}

function release(l: Bindings, obj: Ptr): void {
  if (obj) koffi.call(method(obj, RELEASE), l.release, obj)
}

function takeBstr(l: Bindings, s: Ptr): string {
  if (!s) return ''
  try {
    const len = l.stringLength(s)
    return len ? (koffi.decode(s, koffi.array('char16_t', len, 'String')) as string) : ''
  } finally {
    l.freeString(s)
  }
}

function tabNames(l: Bindings, hwnd: Ptr): string[] {
  const element: Ptr[] = [null]
  if (koffi.call(method(l.automation, AUTOMATION_ELEMENT_FROM_HANDLE), l.fromHandle, l.automation, hwnd, element) < 0) return []
  const list: Ptr[] = [null]
  try {
    const hr = koffi.call(method(element[0], ELEMENT_FIND_ALL), l.findAll, element[0], TREE_SCOPE_DESCENDANTS, l.tabCondition, list)
    if (hr < 0 || !list[0]) return []
    const count = [0]
    koffi.call(method(list[0], ARRAY_LENGTH), l.outInt, list[0], count)
    const names: string[] = []
    for (let i = 0; i < count[0]; i++) {
      const item: Ptr[] = [null]
      if (koffi.call(method(list[0], ARRAY_GET_ELEMENT), l.getAt, list[0], i, item) < 0) continue
      const name: Ptr[] = [null]
      koffi.call(method(item[0], ELEMENT_CURRENT_NAME), l.outPtr, item[0], name)
      names.push(takeBstr(l, name[0]))
      release(l, item[0])
    }
    return names
  } finally {
    release(l, list[0])
    release(l, element[0])
  }
}

/**
 * Titles of the tabs open in one kind of browser, across its windows. Includes other tab-like
 * things on its pages (a site's own tabs), which callers can ignore.
 */
export function browserTabTitles(kind: BrowserKind): string[] {
  const l = bindings()
  if (!l) return []
  const titles: string[] = []
  let hwnd: Ptr = null
  while ((hwnd = l.findWindow(null, hwnd, WINDOW_CLASS[kind], null))) {
    if (kind === 'chromium' && !CHROMIUM_EXE.test(processPathOfWindow(hwnd) ?? '')) continue
    titles.push(...tabNames(l, hwnd))
  }
  return titles
}
