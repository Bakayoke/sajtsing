export type TravelMode = 'walk' | 'run' | 'bike' | 'drive'

export type CreateRouteInput = {
  start?: { lat?: number; lng?: number }
  durationMinutes?: number
  mode?: TravelMode
  seed?: string
}

/** Rough average speeds used to turn time into distance (m/s). */
const SPEED_MS: Record<TravelMode, number> = {
  walk: 5 / 3.6,
  run: 9 / 3.6,
  bike: 16 / 3.6,
  drive: 35 / 3.6,
}

const ORS_PROFILE: Record<TravelMode, string> = {
  walk: 'foot-walking',
  run: 'foot-walking',
  bike: 'cycling-regular',
  drive: 'driving-car',
}

/** More points → more circular loops (ORS round_trip). */
const ROUND_TRIP_POINTS = 5

function assertInput(body: CreateRouteInput) {
  const lat = body.start?.lat
  const lng = body.start?.lng
  const durationMinutes = body.durationMinutes
  const mode = body.mode

  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
    throw new Error('Invalid start coordinates')
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error('Invalid start coordinates')
  }
  if (typeof durationMinutes !== 'number' || durationMinutes < 10 || durationMinutes > 180) {
    throw new Error('Invalid durationMinutes (10–180)')
  }
  if (!mode || !(mode in SPEED_MS)) {
    throw new Error('Invalid mode')
  }

  return { lat, lng, durationMinutes, mode }
}

function seedToInt(seed?: string): number {
  if (!seed) return Math.floor(Math.random() * 100_000)
  const n = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0)
  return (n % 90_000) + 1
}

function simplifyWaypoints(
  coords: [number, number][],
  maxPoints = 8,
): { lat: number; lng: number }[] {
  if (coords.length === 0) return []
  if (coords.length <= maxPoints) {
    return coords.map(([lng, lat]) => ({ lat, lng }))
  }
  const step = (coords.length - 1) / (maxPoints - 1)
  const out: { lat: number; lng: number }[] = []
  for (let i = 0; i < maxPoints; i++) {
    const [lng, lat] = coords[Math.round(i * step)]!
    out.push({ lat, lng })
  }
  return out
}

function googleMapsUrl(
  start: { lat: number; lng: number },
  waypoints: { lat: number; lng: number }[],
  mode: TravelMode,
) {
  const travelmode =
    mode === 'drive' ? 'driving' : mode === 'bike' ? 'bicycling' : 'walking'
  // Intermediate stops only — origin/destination are the start (closed loop)
  const mids = waypoints.slice(1, -1).slice(0, 8)
  const params = new URLSearchParams({
    api: '1',
    origin: `${start.lat},${start.lng}`,
    destination: `${start.lat},${start.lng}`,
    travelmode,
  })
  if (mids.length) {
    params.set('waypoints', mids.map((p) => `${p.lat},${p.lng}`).join('|'))
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

function appleMapsUrl(
  start: { lat: number; lng: number },
  waypoints: { lat: number; lng: number }[],
  mode: TravelMode,
) {
  const dirflg = mode === 'drive' ? 'd' : mode === 'bike' ? 'c' : 'w'
  // Apple Maps URL scheme is limited; chain midpoints as daddr hops when possible
  const mids = waypoints.slice(1, -1)
  const dest = mids[mids.length - 1] ?? start
  const via = mids.slice(0, -1)
  const daddr =
    via.length > 0
      ? [...via.map((p) => `${p.lat},${p.lng}`), `${dest.lat},${dest.lng}`].join(' to:')
      : `${dest.lat},${dest.lng}`
  const params = new URLSearchParams({
    saddr: `${start.lat},${start.lng}`,
    daddr,
    dirflg,
  })
  return `http://maps.apple.com/?${params.toString()}`
}

export async function createRoute(body: CreateRouteInput) {
  const { lat, lng, durationMinutes, mode } = assertInput(body)
  const apiKey = process.env.ORS_API_KEY
  if (!apiKey) {
    throw new Error('ORS_API_KEY is not configured')
  }

  const totalDistanceM = Math.round(SPEED_MS[mode] * durationMinutes * 60)
  const profile = ORS_PROFILE[mode]
  const seed = seedToInt(body.seed)

  const url = `https://api.openrouteservice.org/v2/directions/${profile}/geojson`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      coordinates: [[lng, lat]],
      instructions: false,
      options: {
        round_trip: {
          length: totalDistanceM,
          points: ROUND_TRIP_POINTS,
          seed,
        },
      },
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Routing failed (${res.status}): ${text.slice(0, 200)}`)
  }

  const geojson = (await res.json()) as {
    features?: Array<{
      geometry?: { coordinates?: [number, number][] }
      properties?: {
        summary?: { distance?: number; duration?: number }
        way_points?: number[]
      }
    }>
  }

  const feature = geojson.features?.[0]
  const coordinates = feature?.geometry?.coordinates
  if (!coordinates?.length) {
    throw new Error('Routing returned no geometry')
  }

  const distanceMeters = feature?.properties?.summary?.distance ?? totalDistanceM
  const durationSec = feature?.properties?.summary?.duration ?? durationMinutes * 60

  // Prefer ORS waypoint indices (the generated round-trip corners) for Maps export
  const wpIdx = feature?.properties?.way_points
  let waypoints: { lat: number; lng: number }[]
  if (wpIdx && wpIdx.length >= 2) {
    waypoints = wpIdx.map((i) => {
      const [wLng, wLat] = coordinates[Math.min(i, coordinates.length - 1)]!
      return { lat: wLat, lng: wLng }
    })
  } else {
    waypoints = simplifyWaypoints(coordinates)
  }

  const start = { lat, lng }

  return {
    id: `rt_${Date.now().toString(36)}`,
    mode,
    durationMinutes: Math.round(durationSec / 60),
    distanceMeters: Math.round(distanceMeters),
    geometry: { type: 'LineString' as const, coordinates },
    waypoints,
    export: {
      googleMapsUrl: googleMapsUrl(start, waypoints, mode),
      appleMapsUrl: appleMapsUrl(start, waypoints, mode),
    },
  }
}
