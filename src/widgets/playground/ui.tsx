import { FlaskConical } from 'lucide-react'
import { defineWidgetUI, useWidget, useWidgetValue } from '@renderer/widgets/sdk'
import { usePulse } from '@renderer/store'

const ID = 'playground'

function useCount(): number {
  return useWidgetValue(ID, 'getCount', 'count', 0)
}

function Page(): JSX.Element {
  const count = useCount()
  const { call } = useWidget(ID)
  const close = usePulse((s) => s.close)

  // Activities only show on the collapsed notch, so close first.
  const showSamples = (): void => {
    close()
    call('sampleActivities')
  }

  return (
    <div className="pg">
      <div className="pg-count">{count}</div>
      <p className="muted small">Stored by the service, survives restarts.</p>
      <div className="pg-actions">
        <button className="btn" onClick={() => call('increment')}>
          Increment
        </button>
        <button className="btn" onClick={() => call('reset')}>
          Reset
        </button>
        <button className="btn btn-primary" onClick={showSamples}>
          Close and show sample activities
        </button>
      </div>
    </div>
  )
}

function Card(): JSX.Element {
  return <div className="pg-card-count">{useCount()}</div>
}

export default defineWidgetUI({ icon: FlaskConical, Page, Card })
