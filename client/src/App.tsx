import { useState } from 'react'

type Mode = 'walk' | 'run' | 'bike' | 'drive'

type RouteResponse = {
  durationMinutes: number
  distanceMeters: number
  export: {
    googleMapsUrl: string
    appleMapsUrl: string
  }
}

const MODES: { id: Mode; label: string }[] = [
  { id: 'walk', label: 'Gång' },
  { id: 'run', label: 'Löp' },
  { id: 'bike', label: 'Cykel' },
  { id: 'drive', label: 'Bil' },
]

const apiBase = import.meta.env.VITE_API_URL ?? ''

export default function App() {
  const [mode, setMode] = useState<Mode>('walk')
  const [minutes, setMinutes] = useState(45)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [route, setRoute] = useState<RouteResponse | null>(null)

  async function createSlinga(regenerate = false) {
    setLoading(true)
    setError(null)
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Geolocation saknas i webbläsaren'))
          return
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12000,
        })
      })

      const res = await fetch(`${apiBase}/v1/routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          },
          durationMinutes: minutes,
          mode,
          seed: regenerate ? `${Date.now()}` : undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error ?? 'Kunde inte skapa rutt')
      }
      setRoute(data as RouteResponse)
    } catch (err) {
      const message =
        err instanceof GeolocationPositionError
          ? 'Tillåt plats så Sajtsing kan starta från dig'
          : err instanceof Error
            ? err.message
            : 'Något gick fel'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const km = route ? (route.distanceMeters / 1000).toFixed(1) : null

  return (
    <main className="app">
      <h1 className="brand">Sajtsing</h1>
      <p className="tagline">En rutt för den tid du har.</p>

      {!route ? (
        <section className="panel">
          <label>
            Tid (minuter)
            <input
              type="number"
              min={10}
              max={180}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </label>

          <div>
            <label style={{ marginBottom: '0.4rem' }}>Färdsätt</label>
            <div className="modes">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={mode === m.id ? 'active' : ''}
                  onClick={() => setMode(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="error">{error}</p>}

          <button
            type="button"
            className="primary"
            disabled={loading}
            onClick={() => createSlinga(false)}
          >
            {loading ? 'Ritar din sajtsing…' : 'Skapa sajtsing'}
          </button>
        </section>
      ) : (
        <section className="panel">
          <p className="result-meta">
            Ca {route.durationMinutes} min · {km} km
          </p>
          <div className="actions">
            <a className="primary" href={route.export.googleMapsUrl} style={{ textAlign: 'center', textDecoration: 'none' }}>
              Öppna i Google Maps
            </a>
            <a className="secondary" href={route.export.appleMapsUrl} style={{ textAlign: 'center', textDecoration: 'none' }}>
              Öppna i Apple Maps
            </a>
            <button type="button" className="secondary" disabled={loading} onClick={() => createSlinga(true)}>
              Ny sajtsing
            </button>
            <button type="button" className="secondary" onClick={() => setRoute(null)}>
              Ändra tid / läge
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </section>
      )}
    </main>
  )
}
