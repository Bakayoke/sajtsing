import { useCallback, useEffect, useMemo, useState } from 'react'
import StartMap, { type LatLng, type PickTarget } from './StartMap'
import { appleMapsRouteUrl, googleMapsRouteUrl } from './mapsExport'
import FikaTip from './FikaTip'

type Mode = 'walk' | 'run' | 'bike' | 'drive'
type BikeType = 'regular' | 'electric' | 'road'
type TripKind = 'loop' | 'to'

type RouteResponse = {
  kind?: TripKind
  mode: Mode
  durationMinutes: number
  distanceMeters: number
  bikeType?: BikeType
  note?: string | null
  waypoints: LatLng[]
  start?: LatLng
  end?: LatLng
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
  const [tripKind, setTripKind] = useState<TripKind>('loop')
  const [pickTarget, setPickTarget] = useState<PickTarget>('start')
  const [mode, setMode] = useState<Mode>('walk')
  const [bikeType, setBikeType] = useState<BikeType>('regular')
  const [minutes, setMinutes] = useState(45)
  const [start, setStart] = useState<LatLng | null>(null)
  const [end, setEnd] = useState<LatLng | null>(null)
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

  useEffect(() => {
    if (tripKind === 'loop') {
      setPickTarget('start')
    } else if (!end) {
      setPickTarget('end')
    }
  }, [tripKind, end])

  async function createSlinga(regenerate = false) {
    if (!start) {
      setError('Välj en startpunkt på kartan först')
      return
    }
    if (tripKind === 'to' && !end) {
      setError('Välj ett mål på kartan')
      setPickTarget('end')
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
          end: tripKind === 'to' ? end : undefined,
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
    const dest = tripKind === 'to' && end ? end : (route.end ?? start)
    const waypoints =
      route.waypoints?.length >= 2
        ? route.waypoints
        : [
            start,
            ...route.geometry.coordinates
              .filter((_, i, arr) => i > 0 && i < arr.length - 1 && i % Math.ceil(arr.length / 8) === 0)
              .map(([lng, lat]) => ({ lat, lng })),
            dest,
          ]
    return {
      google: googleMapsRouteUrl(start, dest, waypoints, route.mode ?? mode),
      apple: appleMapsRouteUrl(start, dest, waypoints, route.mode ?? mode),
    }
  }, [route, start, end, mode, tripKind])

  const canCreate = Boolean(start && (tripKind === 'loop' || end))

  return (
    <main className="app">
      <header className="hero">
        <h1 className="brand">
          <span>Sajtsing</span>
        </h1>
        <p className="tagline">En rutt för den tid du har.</p>
      </header>

      {!route ? (
        <section className="panel">
          <div className="field">
            <span className="field-label">Läge</span>
            <div className="modes trip-kinds">
              <button
                type="button"
                className={tripKind === 'loop' ? 'active' : ''}
                onClick={() => setTripKind('loop')}
              >
                Runda
              </button>
              <button
                type="button"
                className={tripKind === 'to' ? 'active' : ''}
                onClick={() => setTripKind('to')}
              >
                Dit
              </button>
            </div>
            <p className="hint">
              {tripKind === 'loop'
                ? 'En runda att sajtsa — ungefär den tid du väljer.'
                : 'Från start till mål, med en omväg så du får sajtsa hela tiden.'}
            </p>
          </div>

          <div className="start-block">
            <div className="field-label">
              <span>Karta</span>
              <button type="button" className="linkish" onClick={useMyLocation} disabled={locating}>
                {locating ? 'Hämtar…' : 'Min plats'}
              </button>
            </div>

            {tripKind === 'to' && (
              <div className="modes pick-targets">
                <button
                  type="button"
                  className={pickTarget === 'start' ? 'active' : ''}
                  onClick={() => setPickTarget('start')}
                >
                  Start
                </button>
                <button
                  type="button"
                  className={pickTarget === 'end' ? 'active' : ''}
                  onClick={() => setPickTarget('end')}
                >
                  Mål
                </button>
              </div>
            )}

            <div className="map-shell">
              <StartMap
                start={start}
                end={tripKind === 'to' ? end : null}
                pickTarget={pickTarget}
                onPickStart={setStart}
                onPickEnd={(p) => {
                  setEnd(p)
                  setPickTarget('end')
                }}
              />
            </div>
            <p className="hint">
              {tripKind === 'loop'
                ? start
                  ? 'Dra pinnen eller tryck på kartan för att byta start.'
                  : 'Tryck på kartan för att välja start, eller tillåt plats.'
                : pickTarget === 'start'
                  ? 'Sätt start. Byt till Mål för att välja destination.'
                  : end
                    ? 'Dra eller tryck för att flytta målet (orange).'
                    : 'Tryck på kartan för att sätta mål (orange).'}
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
            disabled={loading || !canCreate}
            onClick={() => createSlinga(false)}
          >
            {loading ? 'Ritar din runda…' : 'Sajtsa'}
          </button>
        </section>
      ) : (
        <section className="panel result">
          <div className="map-shell">
            <StartMap
              start={start}
              end={route.kind === 'to' || tripKind === 'to' ? end ?? route.end : null}
              routeCoords={route.geometry.coordinates}
              interactive={false}
              routeColor="#ff5a1f"
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
            {route.kind === 'to' || tripKind === 'to'
              ? 'Sajtsar dit · med omväg'
              : 'Sajtsar runt · tillbaka till start'}
            {bikeLabel ? ` · ${bikeLabel}` : ''}
          </p>
          {route.note && <p className="hint accent-hint">{route.note}</p>}

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
              Ny runda
            </button>
            <button type="button" className="secondary" onClick={() => setRoute(null)}>
              Ändra tid / start
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </section>
      )}

      <FikaTip />

      <p className="map-credit">
        Karta ©{' '}
        <a href="https://openfreemap.org" target="_blank" rel="noreferrer">
          OpenFreeMap
        </a>
        {' · '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap
        </a>
      </p>
    </main>
  )
}
