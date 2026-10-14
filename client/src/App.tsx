import { useCallback, useEffect, useState } from 'react'
import StartMap, { type LatLng } from './StartMap'

type Mode = 'walk' | 'run' | 'bike' | 'drive'

type RouteResponse = {
  durationMinutes: number
  distanceMeters: number
  geometry: { type: 'LineString'; coordinates: [number, number][] }
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

function formatCoords(p: LatLng) {
  return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`
}

export default function App() {
  const [mode, setMode] = useState<Mode>('walk')
  const [minutes, setMinutes] = useState(45)
  const [start, setStart] = useState<LatLng | null>(null)
  const [locating, setLocating] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [route, setRoute] = useState<RouteResponse | null>(null)

  const useMyLocation = useCallback(() => {
    setLocating(true)
    setError(null)
    if (!navigator.geolocation) {
      setLocating(false)
      setError('Geolocation saknas i webbläsaren')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStart({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        })
        setLocating(false)
      },
      () => {
        setLocating(false)
        setError('Tillåt plats, eller tryck på kartan för att välja start')
      },
      { enableHighAccuracy: true, timeout: 12000 },
    )
  }, [])

  useEffect(() => {
    useMyLocation()
  }, [useMyLocation])

  async function createSlinga(regenerate = false) {
    if (!start) {
      setError('Välj en startpunkt på kartan först')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${apiBase}/v1/routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start,
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
      setError(err instanceof Error ? err.message : 'Något gick fel')
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
          <div className="start-block">
            <div className="start-header">
              <label>Startpunkt</label>
              <button type="button" className="linkish" onClick={useMyLocation} disabled={locating}>
                {locating ? 'Hämtar plats…' : 'Min plats'}
              </button>
            </div>
            <StartMap start={start} onPick={setStart} />
            <p className="hint">
              {start
                ? `Start: ${formatCoords(start)} — dra pinnen eller tryck på kartan för att byta.`
                : 'Tryck på kartan för att välja start, eller tillåt plats.'}
            </p>
          </div>

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
            disabled={loading || !start}
            onClick={() => createSlinga(false)}
          >
            {loading ? 'Ritar din sajtsing…' : 'Skapa sajtsing'}
          </button>
        </section>
      ) : (
        <section className="panel">
          <StartMap
            start={start}
            routeCoords={route.geometry.coordinates}
            interactive={false}
          />
          <p className="result-meta">
            Ca {route.durationMinutes} min · {km} km · runda tillbaka till start
          </p>
          <div className="actions">
            <a
              className="primary"
              href={route.export.googleMapsUrl}
              style={{ textAlign: 'center', textDecoration: 'none' }}
            >
              Öppna i Google Maps
            </a>
            <a
              className="secondary"
              href={route.export.appleMapsUrl}
              style={{ textAlign: 'center', textDecoration: 'none' }}
            >
              Öppna i Apple Maps
            </a>
            <button
              type="button"
              className="secondary"
              disabled={loading}
              onClick={() => createSlinga(true)}
            >
              Ny sajtsing
            </button>
            <button type="button" className="secondary" onClick={() => setRoute(null)}>
              Ändra tid / start
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </section>
      )}
    </main>
  )
}
