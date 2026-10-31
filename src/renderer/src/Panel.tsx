import { Home as HomeIcon, Settings as SettingsIcon, X, type LucideIcon } from 'lucide-react'
import { usePulse } from './store'
import { WIDGETS, widgetById, type RegisteredWidget } from './widgets/registry'
import { SettingsPage } from './settings/SettingsPage'

export function Panel(): JSX.Element {
  const activeTab = usePulse((s) => s.activeTab)
  const widget = widgetById(activeTab)
  const settings = activeTab === 'settings'

  return (
    <div className="panel-layout">
      <Header title={widget?.name ?? (settings ? 'Settings' : 'Home')} />
      <main className="panel-body">
        {widget ? <widget.Page /> : settings ? <SettingsPage /> : <Home />}
      </main>
      <Dock />
    </div>
  )
}

function Header({ title }: { title: string }): JSX.Element {
  const close = usePulse((s) => s.close)
  const activeTab = usePulse((s) => s.activeTab)
  const setTab = usePulse((s) => s.setTab)
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short'
  })

  return (
    <header className="panel-header">
      <div className="panel-title">
        <span className="logo" aria-hidden />
        <strong>{title}</strong>
        <span className="divider" />
        <span className="muted">{today}</span>
      </div>
      <div className="panel-header-actions">
        <button
          className={`icon-btn${activeTab === 'settings' ? ' active' : ''}`}
          onClick={() => setTab('settings')}
          title="Settings"
        >
          <SettingsIcon size={15} />
        </button>
        <button className="icon-btn" onClick={close} title="Close (Esc)">
          <X size={16} />
        </button>
      </div>
    </header>
  )
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Good night'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function Home(): JSX.Element {
  return (
    <div className="home">
      <h1 className="greeting">{greeting()}</h1>
      <div className="card-grid">
        {WIDGETS.map((w) => (
          <HomeCard key={w.id} widget={w} />
        ))}
      </div>
    </div>
  )
}

function HomeCard({ widget: { id, name, icon: Icon, Card } }: { widget: RegisteredWidget }): JSX.Element {
  const setTab = usePulse((s) => s.setTab)
  return (
    <section className={`card${Card ? '' : ' card-empty'}`} onClick={() => setTab(id)}>
      <span className="card-label">
        <Icon size={13} />
        {name}
      </span>
      {Card ? <Card /> : <span className="muted small">Coming soon</span>}
    </section>
  )
}

const HOME_TAB: { id: string; name: string; icon: LucideIcon } = {
  id: 'home',
  name: 'Home',
  icon: HomeIcon
}

function Dock(): JSX.Element {
  const activeTab = usePulse((s) => s.activeTab)
  const setTab = usePulse((s) => s.setTab)

  return (
    <nav className="dock">
      {[HOME_TAB, ...WIDGETS].map(({ id, name, icon: Icon }) => (
        <button
          key={id}
          className={`dock-btn${id === activeTab ? ' active' : ''}`}
          onClick={() => setTab(id)}
          title={name}
        >
          <Icon size={18} strokeWidth={1.75} />
        </button>
      ))}
    </nav>
  )
}
