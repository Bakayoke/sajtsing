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

function assertInput(body: CreateRouteInput) {
  const lat = body.start?.lat
  const lng = body.start?.lng
  const durationMinutes = body.durationMinutes
  const mode = body.mode

  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
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

/** Pick a destination ~half the budget away, then ask ORS for a round trip via that point. */
function pickViaPoint(lat: number, lng: number, halfDistanceM: number, seed?: string) {
  const angle =
    seed && seed.length > 0
      ? ([...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % 360) * (Math.PI / 180)
      : Math.random() * Math.PI * 2

  const earthR = 6371000
  const dLat = (halfDistanceM * Math.cos(angle)) / earthR
  const dLng = (halfDistanceM * Math.sin(angle)) / (earthR * Math.cos((lat * Math.PI) / 180))

  return {
    lat: lat + (dLat * 180) / Math.PI,
    lng: lng + (dLng * 180) / Math.PI,
  }
}

function simplifyWaypoints(
  coords: [number, number][],
  maxPoints = 8,
): { lat: number; lng: number }[] {
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
  // Drop first/last if they equal start — Maps uses origin + destination (= start for loop)
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
  // Apple Maps URL scheme is limited; send last interesting mid as daddr when possible
  const mid = waypoints[Math.floor(waypoints.length / 2)] ?? start
  const params = new URLSearchParams({
    saddr: `${start.lat},${start.lng}`,
    daddr: `${mid.lat},${mid.lng}`,
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

  const totalDistanceM = SPEED_MS[mode] * durationMinutes * 60
  const via = pickViaPoint(lat, lng, totalDistanceM / 2, body.seed)
  const profile = ORS_PROFILE[mode]

  const url = `https://api.openrouteservice.org/v2/directions/${profile}/geojson`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      coordinates: [
        [lng, lat],
        [via.lng, via.lat],
        [lng, lat],
      ],
      instructions: false,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Routing failed (${res.status}): ${text.slice(0, 200)}`)
  }

  const geojson = (await res.json()) as {
    features?: Array<{
      geometry?: { coordinates?: [number, number][] }
      properties?: { summary?: { distance?: number; duration?: number } }
    }>
  }

  const feature = geojson.features?.[0]
  const coordinates = feature?.geometry?.coordinates
  if (!coordinates?.length) {
    throw new Error('Routing returned no geometry')
  }

  const distanceMeters = feature?.properties?.summary?.distance ?? totalDistanceM
  const durationSec = feature?.properties?.summary?.duration ?? durationMinutes * 60
  const waypoints = simplifyWaypoints(coordinates)
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
