import { useEffect, useState } from 'react'
import { Workspace } from './Workspace.tsx'

/** The only presentation difference is which wording/layout the workspace renders. */
type Presentation = 'default' | 'rewritten'

interface PresentationResponse {
  readonly presentation: Presentation
}

export function App() {
  const [presentation, setPresentation] = useState<Presentation>('default')

  // The presentation variant is published as a plain UI preference. It carries no variant id and
  // no failure description, so fetching it tells an agent nothing about the business outcome.
  useEffect(() => {
    fetch('/api/exports/ui')
      .then((r) => (r.ok ? r.json() : ({ presentation: 'default' } as PresentationResponse)))
      .then((body: PresentationResponse) =>
        setPresentation(body.presentation === 'rewritten' ? 'rewritten' : 'default'),
      )
      .catch(() => setPresentation('default'))
  }, [])

  return (
    <div className="app">
      <header>
        <h1>DataPort</h1>
        <nav>
          <a href="#workspace">Exports</a>
          <a href="#history">History</a>
        </nav>
      </header>
      <main>
        <Workspace variant={presentation} />
      </main>
      <footer className="muted">
        Exports are generated on request and remain available from this workspace.
      </footer>
    </div>
  )
}
