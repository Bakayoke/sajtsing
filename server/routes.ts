export type TravelMode = 'walk' | 'run' | 'bike' | 'drive'
export type BikeType = 'regular' | 'electric' | 'road'

export type CreateRouteInput = {
  start?: { lat?: number; lng?: number }
  /** If set, build A→B taking ~durationMinutes (with scenic detours if needed). */
  end?: { lat?: number; lng?: number }
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

const CIRCLE_VIA_POINTS = 6
const MAX_ROUTE_ATTEMPTS = 3

type LatLng = { lat: number; lng: number }

function assertCoord(label: string, point?: { lat?: number; lng?: number }): LatLng {
  const lat = point?.lat
  const lng = point?.lng
  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
    throw new Error(`Invalid ${label} coordinates`)
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error(`Invalid ${label} coordinates`)
  }
  return { lat, lng }
}

function assertInput(body: CreateRouteInput) {
  const start = assertCoord('start', body.start)
  const end =
    body.end &&
    typeof body.end.lat === 'number' &&
    typeof body.end.lng === 'number' &&
    !Number.isNaN(body.end.lat) &&
    !Number.isNaN(body.end.lng)
      ? assertCoord('end', body.end)
      : null

  const durationMinutes = body.durationMinutes
  const mode = body.mode
  const bikeType: BikeType =
    body.bikeType === 'electric' || body.bikeType === 'road' ? body.bikeType : 'regular'

  if (typeof durationMinutes !== 'number' || durationMinutes < 10 || durationMinutes > 180) {
    throw new Error('Invalid durationMinutes (10–180)')
  }
  if (!mode || !(mode in SPEED_MS)) {
    throw new Error('Invalid mode')
  }
  if (end && haversineM(start, end) < 40) {
    throw new Error('Mål måste skilja sig från start')
  }

  return { start, end, durationMinutes, mode, bikeType }
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

function haversineM(a: LatLng, b: LatLng): number {
  const R = 6371000
  const φ1 = (a.lat * Math.PI) / 180
  const φ2 = (b.lat * Math.PI) / 180
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180
  const s =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

function bearingRad(a: LatLng, b: LatLng): number {
  const φ1 = (a.lat * Math.PI) / 180
  const φ2 = (b.lat * Math.PI) / 180
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return Math.atan2(y, x)
}

function destinationPoint(lat: number, lng: number, distanceM: number, bearing: number) {
  const R = 6371000
  const δ = distanceM / R
  const φ1 = (lat * Math.PI) / 180
  const λ1 = (lng * Math.PI) / 180
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(bearing),
  )
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    )
  return {
    lat: (φ2 * 180) / Math.PI,
    lng: ((((λ2 * 180) / Math.PI + 540) % 360) - 180),
  }
}

function circularLoopCoordinates(
  lat: number,
  lng: number,
  lengthM: number,
  seed: number,
  viaCount = CIRCLE_VIA_POINTS,
): [number, number][] {
  const radius = (lengthM * 0.8) / (2 * Math.PI)
  const orient = ((seed % 360) * Math.PI) / 180
  const center = destinationPoint(lat, lng, radius, orient + Math.PI)
  const startAngle = orient
  const totalPoints = viaCount + 1
  const coords: [number, number][] = [[lng, lat]]

  for (let i = 1; i < totalPoints; i++) {
    const angle = startAngle + (2 * Math.PI * i) / totalPoints
    const p = destinationPoint(center.lat, center.lng, radius, angle)
    coords.push([p.lng, p.lat])
  }
  coords.push([lng, lat])
  return coords
}

/** Scenic A→B: vias bulge off the direct line so road distance ≈ targetLengthM. */
function detourCoordinates(
  start: LatLng,
  end: LatLng,
  targetLengthM: number,
  seed: number,
  amplitudeScale = 1,
): [number, number][] {
  const direct = haversineM(start, end)
  const bearing = bearingRad(start, end)
  const side = seed % 2 === 0 ? 1 : -1
  const perp = bearing + (Math.PI / 2) * side
  const extra = Math.max(0, targetLengthM - direct * 1.2)
  let amp = Math.min(extra * 0.42, direct * 0.9, targetLengthM * 0.28) * amplitudeScale
  if (targetLengthM > direct * 1.15) {
    amp = Math.max(amp, Math.min(direct * 0.25, 400))
  }

  const viaCount = amp > 600 ? 5 : 4
  const coords: [number, number][] = [[start.lng, start.lat]]
  for (let i = 1; i <= viaCount; i++) {
    const t = i / (viaCount + 1)
    const along = destinationPoint(start.lat, start.lng, direct * t, bearing)
    const bulge = Math.sin(t * Math.PI) * amp
    const p = destinationPoint(along.lat, along.lng, bulge, perp)
    coords.push([p.lng, p.lat])
  }
  coords.push([end.lng, end.lat])
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
): LatLng[] {
  if (coords.length === 0) return []
  if (coords.length <= maxPoints) {
    return coords.map(([lng, lat]) => ({ lat, lng }))
  }
  const step = (coords.length - 1) / (maxPoints - 1)
  const out: LatLng[] = []
  for (let i = 0; i < maxPoints; i++) {
    const [lng, lat] = coords[Math.round(i * step)]!
    out.push({ lat, lng })
  }
  return out
}

function exportMids(waypoints: LatLng[]): LatLng[] {
  const mids = waypoints.slice(1, -1).slice(0, 8)
  if (mids.length > 0) return mids
  if (waypoints.length <= 2) return []
  return waypoints.slice(1, -1)
}

function googleMapsUrl(start: LatLng, end: LatLng, waypoints: LatLng[], mode: TravelMode) {
  const mids = exportMids(waypoints)
  const modeCode = mode === 'drive' ? '0' : mode === 'bike' ? '1' : '2'
  const stops = [
    `${start.lat},${start.lng}`,
    ...mids.map((p) => `${p.lat},${p.lng}`),
    `${end.lat},${end.lng}`,
  ]
  return `https://www.google.com/maps/dir/${stops.join('/')}/data=!4m2!4m1!3e${modeCode}`
}

function appleMapsUrl(start: LatLng, end: LatLng, waypoints: LatLng[], mode: TravelMode) {
  const dirflg = mode === 'drive' ? 'd' : mode === 'bike' ? 'c' : 'w'
  const mids = exportMids(waypoints)
  const saddr = `${start.lat},${start.lng}`
  const daddr = [...mids.map((p) => `${p.lat},${p.lng}`), `${end.lat},${end.lng}`].join('+to:')
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
  return orsDirections(apiKey, profile, {
    coordinates: circularLoopCoordinates(lat, lng, lengthM, seed),
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

async function routeDirect(
  apiKey: string,
  profile: string,
  start: LatLng,
  end: LatLng,
): Promise<OrsFeature> {
  return orsDirections(apiKey, profile, {
    coordinates: [
      [start.lng, start.lat],
      [end.lng, end.lat],
    ],
    instructions: false,
  })
}

async function routeDetour(
  apiKey: string,
  profile: string,
  start: LatLng,
  end: LatLng,
  targetLengthM: number,
  seed: number,
  amplitudeScale: number,
): Promise<OrsFeature> {
  return orsDirections(apiKey, profile, {
    coordinates: detourCoordinates(start, end, targetLengthM, seed, amplitudeScale),
    instructions: false,
  })
}

function pickWaypoints(feature: OrsFeature, coordinates: [number, number][]): LatLng[] {
  const wpIdx = feature.properties?.way_points
  if (wpIdx && wpIdx.length >= 3) {
    const fromOrs = wpIdx.map((i) => {
      const [wLng, wLat] = coordinates[Math.min(i, coordinates.length - 1)]!
      return { lat: wLat, lng: wLng }
    })
    if (fromOrs.length >= 3) return fromOrs
  }
  return simplifyWaypoints(coordinates, 8)
}

function durationSecOf(feature: OrsFeature, fallback: number) {
  return feature.properties?.summary?.duration ?? fallback
}

async function createLoopRoute(
  apiKey: string,
  profile: string,
  start: LatLng,
  totalDistanceM: number,
  seed: number,
  durationMinutes: number,
) {
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
          start.lat,
          start.lng,
          totalDistanceM,
          attemptSeed,
        )
      } catch (err) {
        feature = await routeOrsRoundTrip(
          apiKey,
          profile,
          start.lat,
          start.lng,
          totalDistanceM,
          attemptSeed,
        )
        lastError = err instanceof Error ? err : lastError
      }

      const aspect = bboxAspect(feature.geometry!.coordinates!)
      if (aspect < bestAspect) {
        best = feature
        bestAspect = aspect
      }
      if (aspect <= 2.2) break
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Routing failed')
    }
  }

  if (!best?.geometry?.coordinates?.length) {
    throw lastError ?? new Error('Routing failed')
  }

  return {
    feature: best,
    kind: 'loop' as const,
    note: null as string | null,
    durationFallback: durationMinutes * 60,
    distanceFallback: totalDistanceM,
  }
}

async function createToRoute(
  apiKey: string,
  profile: string,
  start: LatLng,
  end: LatLng,
  targetDistanceM: number,
  seed: number,
  durationMinutes: number,
) {
  const direct = await routeDirect(apiKey, profile, start, end)
  const directSec = durationSecOf(direct, 0)
  const directM = direct.properties?.summary?.distance ?? haversineM(start, end)
  const targetSec = durationMinutes * 60

  // Already as long as (or longer than) requested — use shortest path
  if (directSec >= targetSec * 0.92) {
    return {
      feature: direct,
      kind: 'to' as const,
      note:
        directSec > targetSec * 1.15
          ? `Kortaste vägen tar redan ca ${Math.round(directSec / 60)} min`
          : null,
      durationFallback: directSec || targetSec,
      distanceFallback: directM,
    }
  }

  // Inflate with detours; pick closest to target duration
  let best = direct
  let bestDiff = Math.abs(directSec - targetSec)
  const scales = [0.7, 1, 1.35, 1.8]

  for (let attempt = 0; attempt < scales.length; attempt++) {
    try {
      const feature = await routeDetour(
        apiKey,
        profile,
        start,
        end,
        targetDistanceM,
        seed + attempt * 31,
        scales[attempt]!,
      )
      const sec = durationSecOf(feature, targetSec)
      const diff = Math.abs(sec - targetSec)
      if (diff < bestDiff) {
        best = feature
        bestDiff = diff
      }
      if (diff / targetSec <= 0.12) break
    } catch {
      // try next scale
    }
  }

  return {
    feature: best,
    kind: 'to' as const,
    note: null as string | null,
    durationFallback: targetSec,
    distanceFallback: targetDistanceM,
  }
}

export async function createRoute(body: CreateRouteInput) {
  const { start, end, durationMinutes, mode, bikeType } = assertInput(body)
  const apiKey = process.env.ORS_API_KEY
  if (!apiKey) {
    throw new Error('ORS_API_KEY is not configured')
  }

  const totalDistanceM = Math.round(speedFor(mode, bikeType) * durationMinutes * 60)
  const profile = profileFor(mode, bikeType)
  const seed = seedToInt(body.seed)

  const result = end
    ? await createToRoute(
        apiKey,
        profile,
        start,
        end,
        totalDistanceM,
        seed,
        durationMinutes,
      )
    : await createLoopRoute(apiKey, profile, start, totalDistanceM, seed, durationMinutes)

  const coordinates = result.feature.geometry!.coordinates!
  const distanceMeters =
    result.feature.properties?.summary?.distance ?? result.distanceFallback
  const durationSec = durationSecOf(result.feature, result.durationFallback)
  const waypoints = pickWaypoints(result.feature, coordinates)
  const dest = end ?? start

  return {
    id: `rt_${Date.now().toString(36)}`,
    kind: result.kind,
    mode,
    bikeType: mode === 'bike' ? bikeType : undefined,
    durationMinutes: Math.round(durationSec / 60),
    distanceMeters: Math.round(distanceMeters),
    note: result.note,
    geometry: { type: 'LineString' as const, coordinates },
    waypoints,
    start,
    end: dest,
    export: {
      googleMapsUrl: googleMapsUrl(start, dest, waypoints, mode),
      appleMapsUrl: appleMapsUrl(start, dest, waypoints, mode),
    },
  }
}
