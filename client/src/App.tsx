import { useCallback, useEffect, useMemo, useState } from 'react'
import StartMap, { type LatLng } from './StartMap'
import { appleMapsLoopUrl, googleMapsLoopUrl } from './mapsExport'

type Mode = 'walk' | 'run' | 'bike' | 'drive'
type BikeType = 'regular' | 'electric' | 'road'

type RouteResponse = {
  mode: Mode
  durationMinutes: number
  distanceMeters: number
  bikeType?: BikeType
  waypoints: LatLng[]
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

const BIKE_TYPES: { id: BikeType; label: string; hint: string }[] = [
  { id: 'regular', label: 'Vanlig', hint: '~16 km/h' },
  { id: 'electric', label: 'El', hint: '~22 km/h' },
  { id: 'road', label: 'Landsväg', hint: '~28 km/h' },
]

const TIME_PRESETS = [15, 30, 45, 60, 90]

const apiBase = import.meta.env.VITE_API_URL ?? ''

export default function App() {
  const [mode, setMode] = useState<Mode>('walk')
  const [bikeType, setBikeType] = useState<BikeType>('regular')
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
          bikeType: mode === 'bike' ? bikeType : undefined,
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

  const km = route ? (route.distanceMeters / 1000).toFixed(1).replace('.', ',') : null
  const bikeLabel =
    route?.bikeType && BIKE_TYPES.find((b) => b.id === route.bikeType)?.label

  const exportLinks = useMemo(() => {
    if (!route || !start) return null
    const waypoints =
      route.waypoints?.length >= 3
        ? route.waypoints
        : [
            start,
            ...route.geometry.coordinates
              .filter((_, i, arr) => i > 0 && i < arr.length - 1 && i % Math.ceil(arr.length / 8) === 0)
              .map(([lng, lat]) => ({ lat, lng })),
            start,
          ]
    return {
      google: googleMapsLoopUrl(start, waypoints, route.mode ?? mode),
      apple: appleMapsLoopUrl(start, waypoints, route.mode ?? mode),
    }
  }, [route, start, mode])

  return (
    <main className="app">
      <header className="hero">
        <h1 className="brand">Sajtsing</h1>
        <p className="tagline">En rutt för den tid du har.</p>
      </header>

      {!route ? (
        <section className="panel">
          <div className="start-block">
            <div className="field-label">
              <span>Startpunkt</span>
              <button type="button" className="linkish" onClick={useMyLocation} disabled={locating}>
                {locating ? 'Hämtar…' : 'Min plats'}
              </button>
            </div>
            <div className="map-shell">
              <StartMap start={start} onPick={setStart} />
            </div>
            <p className="hint">
              {start
                ? 'Dra pinnen eller tryck på kartan för att byta start.'
                : 'Tryck på kartan för att välja start, eller tillåt plats.'}
            </p>
          </div>

          <div className="field">
            <span className="field-label">Tid</span>
            <div className="time-row">
              {TIME_PRESETS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={minutes === t ? 'active' : ''}
                  onClick={() => setMinutes(t)}
                >
                  {t} min
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field-label">Färdsätt</span>
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

          {mode === 'bike' && (
            <div className="field">
              <span className="field-label">Cykeltyp</span>
              <div className="modes bike-types">
                {BIKE_TYPES.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className={bikeType === b.id ? 'active' : ''}
                    onClick={() => setBikeType(b.id)}
                    title={b.hint}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
              <p className="hint">Påverkar längd och vägval.</p>
            </div>
          )}

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
        <section className="panel result">
          <div className="map-shell">
            <StartMap
              start={start}
              routeCoords={route.geometry.coordinates}
              interactive={false}
            />
          </div>

          <div className="result-stats">
            <div className="stat">
              <div className="stat-value">{route.durationMinutes}</div>
              <div className="stat-label">Minuter</div>
            </div>
            <div className="stat">
              <div className="stat-value">{km}</div>
              <div className="stat-label">Kilometer</div>
            </div>
          </div>

          <p className="result-note">
            Runda tillbaka till start
            {bikeLabel ? ` · ${bikeLabel}` : ''}
          </p>

          <div className="actions">
            <a
              className="primary"
              href={exportLinks?.google ?? route.export.googleMapsUrl}
              target="_blank"
              rel="noreferrer"
            >
              Öppna i Google Maps
            </a>
            <a
              className="secondary"
              href={exportLinks?.apple ?? route.export.appleMapsUrl}
              target="_blank"
              rel="noreferrer"
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
