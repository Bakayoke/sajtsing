export type LatLng = { lat: number; lng: number }
export type Mode = 'walk' | 'run' | 'bike' | 'drive'

function midsFrom(waypoints: LatLng[]): LatLng[] {
  return waypoints.slice(1, -1).slice(0, 8)
}

function modeCode(mode: Mode) {
  return mode === 'drive' ? '0' : mode === 'bike' ? '1' : '2'
}

function dirflg(mode: Mode) {
  return mode === 'drive' ? 'd' : mode === 'bike' ? 'c' : 'w'
}

/** Path-based URL — works for loops (end=start) and A→B. */
export function googleMapsRouteUrl(
  start: LatLng,
  end: LatLng,
  waypoints: LatLng[],
  mode: Mode,
) {
  const mids = midsFrom(waypoints)
  const stops = [
    `${start.lat},${start.lng}`,
    ...mids.map((p) => `${p.lat},${p.lng}`),
    `${end.lat},${end.lng}`,
  ]
  return `https://www.google.com/maps/dir/${stops.join('/')}/data=!4m2!4m1!3e${modeCode(mode)}`
}

export function appleMapsRouteUrl(
  start: LatLng,
  end: LatLng,
  waypoints: LatLng[],
  mode: Mode,
) {
  const mids = midsFrom(waypoints)
  const saddr = `${start.lat},${start.lng}`
  const daddr = [...mids.map((p) => `${p.lat},${p.lng}`), `${end.lat},${end.lng}`].join('+to:')
  return `https://maps.apple.com/?saddr=${saddr}&daddr=${daddr}&dirflg=${dirflg(mode)}`
}

/** @deprecated use googleMapsRouteUrl */
export function googleMapsLoopUrl(start: LatLng, waypoints: LatLng[], mode: Mode) {
  return googleMapsRouteUrl(start, start, waypoints, mode)
}

/** @deprecated use appleMapsRouteUrl */
export function appleMapsLoopUrl(start: LatLng, waypoints: LatLng[], mode: Mode) {
  return appleMapsRouteUrl(start, start, waypoints, mode)
}
