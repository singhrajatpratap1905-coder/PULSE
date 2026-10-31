import { File as FileIcon, FolderOpen, Plus, Smartphone, X } from 'lucide-react'
import { useWidget, useWidgetValue } from '@renderer/widgets/sdk'
import { usePulse } from '@renderer/store'
import { formatBytes, relativeTime, useNow } from '@renderer/lib/format'
import { formatClock } from '@shared/countdown'
import type { DropState } from './types'

export const ID = 'drop'

const INITIAL: DropState = { session: null, received: [], error: null }

export function useDrop(): DropState {
  return useWidgetValue(ID, 'getState', 'state', INITIAL)
}

export function DropPage(): JSX.Element {
  const { call } = useWidget(ID)
  const s = useDrop()
  const fileDragOver = usePulse((st) => st.fileDragOver)
  const now = useNow(1000, !!s.session)
  const session = s.session

  return (
    <div className="dr">
      <section className="dr-main">
        {session ? (
          <>
            <header className="dr-head">
              <span>
                <strong>Sending</strong>{' '}
                <span className="muted small">
                  {session.files.length
                    ? `${session.files.length} ${session.files.length === 1 ? 'file' : 'files'} · ${formatBytes(session.files.reduce((n, f) => n + f.size, 0))}`
                    : 'nothing yet: your phone can still send to this PC'}
                </span>
              </span>
              <button className="btn btn-small" onClick={() => call('pickFiles')}>
                <Plus size={13} /> Add files
              </button>
            </header>
            <div className="dr-files">
              {session.files.map((f) => (
                <div key={f.id} className="dr-file">
                  <FileIcon size={15} className="muted" />
                  <span className="dr-file-name">{f.name}</span>
                  <span className="muted small">{formatBytes(f.size)}</span>
                  <button className="icon-btn icon-btn-small" title="Stop sharing this file" onClick={() => call('removeFile', f.id)}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="dr-idle">
            <Smartphone size={30} strokeWidth={1.5} />
            <strong>Send files to your phone</strong>
            <span className="muted small">
              Drop files here or choose them. Your phone scans a code and downloads them over your Wi-Fi.
              It can send files back too.
            </span>
            <div className="dr-idle-actions">
              <button className="btn btn-primary btn-small" onClick={() => call('pickFiles')}>
                Choose files
              </button>
              <button className="btn btn-small" onClick={() => call('start', [])}>
                Receive from phone
              </button>
            </div>
            {s.error && <span className="dr-error small">{s.error}</span>}
          </div>
        )}

        <Received />

        {fileDragOver && (
          <div className="sh-drop">
            <Smartphone size={28} strokeWidth={1.5} />
            Drop to send to your phone
          </div>
        )}
      </section>

      {session && (
        <section className="dr-qr">
          <img src={session.qr} alt="QR code for Phone Drop" className="dr-qr-img" draggable={false} />
          <strong>Scan with your phone camera</strong>
          <span className="muted small">Same Wi-Fi as this PC. Nothing leaves your network.</span>
          <span className="muted small">
            Closes in {formatClock(Math.max(0, session.expiresAt - now))}
            {session.downloads > 0 && ` · ${session.downloads} downloaded`}
          </span>
          <button className="btn btn-small" onClick={() => call('stop')}>
            Stop sharing
          </button>
        </section>
      )}
    </div>
  )
}

function Received(): JSX.Element | null {
  const { call } = useWidget(ID)
  const { received } = useDrop()
  const now = useNow()
  if (!received.length) return null
  return (
    <div className="dr-received">
      <header className="dr-received-head">
        <span className="section-label">Received from phone</span>
        <span>
          <button className="link-btn" onClick={() => call('openReceived')}>
            Open folder
          </button>
          <button className="link-btn dr-clear" onClick={() => call('clearReceived')}>
            Clear list
          </button>
        </span>
      </header>
      {received.slice(0, 6).map((f) => (
        <div key={f.id} className="dr-file">
          <FileIcon size={15} className="muted" />
          <span className="dr-file-name">{f.name}</span>
          <span className="muted small">
            {formatBytes(f.size)} · {relativeTime(f.receivedAt, now)}
          </span>
          <button className="icon-btn icon-btn-small" title="Show in folder" onClick={() => call('reveal', f.id)}>
            <FolderOpen size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
