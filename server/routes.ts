export type TravelMode = 'walk' | 'run' | 'bike' | 'drive'
export type BikeType = 'regular' | 'electric' | 'road'

export type CreateRouteInput = {
  start?: { lat?: number; lng?: number }
  durationMinutes?: number
  mode?: TravelMode
  bikeType?: BikeType
  seed?: string
}

const SPEED_MS: Record<TravelMode, number> = {
  walk: 5 / 3.6,
  run: 9 / 3.6,
  bike: 16 / 3.6,
  drive: 35 / 3.6,
}

const BIKE_SPEED_MS: Record<BikeType, number> = {
  regular: 16 / 3.6,
  electric: 22 / 3.6,
  road: 28 / 3.6,
}

const BIKE_PROFILE: Record<BikeType, string> = {
  regular: 'cycling-regular',
  electric: 'cycling-electric',
  road: 'cycling-road',
}

const ORS_PROFILE: Record<Exclude<TravelMode, 'bike'>, string> = {
  walk: 'foot-walking',
  run: 'foot-walking',
  drive: 'driving-car',
}

/** Via-points on the circle (excluding start/end). More → rounder loops. */
const CIRCLE_VIA_POINTS = 6
const MAX_ROUTE_ATTEMPTS = 3

function assertInput(body: CreateRouteInput) {
  const lat = body.start?.lat
  const lng = body.start?.lng
  const durationMinutes = body.durationMinutes
  const mode = body.mode
  const bikeType: BikeType =
    body.bikeType === 'electric' || body.bikeType === 'road' ? body.bikeType : 'regular'

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

  return { lat, lng, durationMinutes, mode, bikeType }
}

function seedToInt(seed?: string): number {
  if (!seed) return Math.floor(Math.random() * 100_000)
  const n = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0)
  return (n % 90_000) + 1
}

function speedFor(mode: TravelMode, bikeType: BikeType): number {
  return mode === 'bike' ? BIKE_SPEED_MS[bikeType] : SPEED_MS[mode]
}

function profileFor(mode: TravelMode, bikeType: BikeType): string {
  return mode === 'bike' ? BIKE_PROFILE[bikeType] : ORS_PROFILE[mode]
}

/** Destination given distance (m) and bearing (rad) from a point. */
function destinationPoint(lat: number, lng: number, distanceM: number, bearingRad: number) {
  const R = 6371000
  const δ = distanceM / R
  const φ1 = (lat * Math.PI) / 180
  const λ1 = (lng * Math.PI) / 180
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(bearingRad),
  )
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    )
  return {
    lat: (φ2 * 180) / Math.PI,
    lng: ((((λ2 * 180) / Math.PI + 540) % 360) - 180),
  }
}

/**
 * Build ORS coordinates for a loop: start sits on a circle; vias are spaced around it.
 * Radius is slightly under circumference/(2π) so road distance ≈ target length.
 */
function circularLoopCoordinates(
  lat: number,
  lng: number,
  lengthM: number,
  seed: number,
  viaCount = CIRCLE_VIA_POINTS,
): [number, number][] {
  const radius = (lengthM * 0.8) / (2 * Math.PI)
  const orient = ((seed % 360) * Math.PI) / 180
  // Center is `radius` inward from start
  const center = destinationPoint(lat, lng, radius, orient + Math.PI)
  const startAngle = orient
  const totalPoints = viaCount + 1 // include start as first ring point
  const coords: [number, number][] = [[lng, lat]]

  for (let i = 1; i < totalPoints; i++) {
    const angle = startAngle + (2 * Math.PI * i) / totalPoints
    const p = destinationPoint(center.lat, center.lng, radius, angle)
    coords.push([p.lng, p.lat])
  }
  coords.push([lng, lat])
  return coords
}

function bboxAspect(coords: [number, number][]): number {
  let minLng = Infinity
  let maxLng = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  for (const [lng, lat] of coords) {
    minLng = Math.min(minLng, lng)
    maxLng = Math.max(maxLng, lng)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  }
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180)
  const width = Math.max((maxLng - minLng) * 111320 * Math.cos(midLat), 1)
  const height = Math.max((maxLat - minLat) * 110540, 1)
  return Math.max(width, height) / Math.min(width, height)
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

function exportMids(waypoints: { lat: number; lng: number }[]): { lat: number; lng: number }[] {
  // Drop start/end duplicates; keep up to 8 vias (Google's practical limit)
  const mids = waypoints.slice(1, -1).slice(0, 8)
  if (mids.length > 0) return mids
  // If ORS only echoed start/end, sample interior of the list instead
  if (waypoints.length <= 2) return []
  return waypoints.slice(1, -1)
}

/**
 * Path-based Google Maps URL — far more reliable for loops than
 * origin=destination&waypoints=… (mobile often drops the vias).
 * !3e0 driving · !3e1 bicycling · !3e2 walking
 */
function googleMapsUrl(
  start: { lat: number; lng: number },
  waypoints: { lat: number; lng: number }[],
  mode: TravelMode,
) {
  const mids = exportMids(waypoints)
  const modeCode = mode === 'drive' ? '0' : mode === 'bike' ? '1' : '2'
  const stops = [
    `${start.lat},${start.lng}`,
    ...mids.map((p) => `${p.lat},${p.lng}`),
    `${start.lat},${start.lng}`,
  ]
  return `https://www.google.com/maps/dir/${stops.join('/')}/data=!4m2!4m1!3e${modeCode}`
}

/** Apple Maps: keep `to:` unencoded — URLSearchParams breaks multi-stop. */
function appleMapsUrl(
  start: { lat: number; lng: number },
  waypoints: { lat: number; lng: number }[],
  mode: TravelMode,
) {
  const dirflg = mode === 'drive' ? 'd' : mode === 'bike' ? 'c' : 'w'
  const mids = exportMids(waypoints)
  const saddr = `${start.lat},${start.lng}`
  if (mids.length === 0) {
    return `https://maps.apple.com/?saddr=${saddr}&daddr=${saddr}&dirflg=${dirflg}`
  }
  // Last mid as final daddr hop, then user can navigate back — or chain all + start
  // Use +to: (no spaces) — spaces in href truncate the URL in browsers
  const daddr = [...mids.map((p) => `${p.lat},${p.lng}`), saddr].join('+to:')
  return `https://maps.apple.com/?saddr=${saddr}&daddr=${daddr}&dirflg=${dirflg}`
}

type OrsFeature = {
  geometry?: { coordinates?: [number, number][] }
  properties?: {
    summary?: { distance?: number; duration?: number }
    way_points?: number[]
  }
}

async function orsDirections(
  apiKey: string,
  profile: string,
  body: Record<string, unknown>,
): Promise<OrsFeature> {
  const url = `https://api.openrouteservice.org/v2/directions/${profile}/geojson`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Routing failed (${res.status}): ${text.slice(0, 200)}`)
  }
  const geojson = (await res.json()) as { features?: OrsFeature[] }
  const feature = geojson.features?.[0]
  if (!feature?.geometry?.coordinates?.length) {
    throw new Error('Routing returned no geometry')
  }
  return feature
}

async function routeCircularLoop(
  apiKey: string,
  profile: string,
  lat: number,
  lng: number,
  lengthM: number,
  seed: number,
): Promise<OrsFeature> {
  const coordinates = circularLoopCoordinates(lat, lng, lengthM, seed)
  return orsDirections(apiKey, profile, {
    coordinates,
    instructions: false,
  })
}

async function routeOrsRoundTrip(
  apiKey: string,
  profile: string,
  lat: number,
  lng: number,
  lengthM: number,
  seed: number,
): Promise<OrsFeature> {
  return orsDirections(apiKey, profile, {
    coordinates: [[lng, lat]],
    instructions: false,
    options: {
      round_trip: {
        length: lengthM,
        points: 9,
        seed,
      },
    },
  })
}

function pickWaypoints(
  feature: OrsFeature,
  coordinates: [number, number][],
): { lat: number; lng: number }[] {
  const wpIdx = feature.properties?.way_points
  if (wpIdx && wpIdx.length >= 3) {
    const fromOrs = wpIdx.map((i) => {
      const [wLng, wLat] = coordinates[Math.min(i, coordinates.length - 1)]!
      return { lat: wLat, lng: wLng }
    })
    // Need real intermediate stops for Maps export
    if (fromOrs.length >= 4) return fromOrs
  }
  // Evenly sample the drawn geometry so export always has shape points
  return simplifyWaypoints(coordinates, 8)
}

export async function createRoute(body: CreateRouteInput) {
  const { lat, lng, durationMinutes, mode, bikeType } = assertInput(body)
  const apiKey = process.env.ORS_API_KEY
  if (!apiKey) {
    throw new Error('ORS_API_KEY is not configured')
  }

  const totalDistanceM = Math.round(speedFor(mode, bikeType) * durationMinutes * 60)
  const profile = profileFor(mode, bikeType)
  let seed = seedToInt(body.seed)

  let best: OrsFeature | null = null
  let bestAspect = Infinity
  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_ROUTE_ATTEMPTS; attempt++) {
    const attemptSeed = seed + attempt * 47
    try {
      let feature: OrsFeature
      try {
        feature = await routeCircularLoop(
          apiKey,
          profile,
          lat,
          lng,
          totalDistanceM,
          attemptSeed,
        )
      } catch (err) {
        // Sparse road grids sometimes can't hit every circle via — fall back to ORS round_trip
        feature = await routeOrsRoundTrip(
          apiKey,
          profile,
          lat,
          lng,
          totalDistanceM,
          attemptSeed,
        )
        lastError = err instanceof Error ? err : lastError
      }

      const coords = feature.geometry!.coordinates!
      const aspect = bboxAspect(coords)
      if (aspect < bestAspect) {
        best = feature
        bestAspect = aspect
      }
      // Good enough circle — stop early
      if (aspect <= 2.2) break
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Routing failed')
    }
  }

  if (!best?.geometry?.coordinates?.length) {
    throw lastError ?? new Error('Routing failed')
  }

  const coordinates = best.geometry.coordinates
  const distanceMeters = best.properties?.summary?.distance ?? totalDistanceM
  const durationSec = best.properties?.summary?.duration ?? durationMinutes * 60
  const waypoints = pickWaypoints(best, coordinates)
  const start = { lat, lng }

  return {
    id: `rt_${Date.now().toString(36)}`,
    mode,
    bikeType: mode === 'bike' ? bikeType : undefined,
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
