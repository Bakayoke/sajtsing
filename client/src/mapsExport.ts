export type LatLng = { lat: number; lng: number }
export type Mode = 'walk' | 'run' | 'bike' | 'drive'

function midsFrom(waypoints: LatLng[]): LatLng[] {
  return waypoints.slice(1, -1).slice(0, 8)
}

/** Path-based loop URL — works when start === end (query waypoints often get dropped). */
export function googleMapsLoopUrl(start: LatLng, waypoints: LatLng[], mode: Mode) {
  const mids = midsFrom(waypoints)
  const modeCode = mode === 'drive' ? '0' : mode === 'bike' ? '1' : '2'
  const stops = [
    `${start.lat},${start.lng}`,
    ...mids.map((p) => `${p.lat},${p.lng}`),
    `${start.lat},${start.lng}`,
  ]
  return `https://www.google.com/maps/dir/${stops.join('/')}/data=!4m2!4m1!3e${modeCode}`
}

export function appleMapsLoopUrl(start: LatLng, waypoints: LatLng[], mode: Mode) {
  const dirflg = mode === 'drive' ? 'd' : mode === 'bike' ? 'c' : 'w'
  const mids = midsFrom(waypoints)
  const saddr = `${start.lat},${start.lng}`
  if (mids.length === 0) {
    return `https://maps.apple.com/?saddr=${saddr}&daddr=${saddr}&dirflg=${dirflg}`
  }
  // Use +to: (no spaces) — spaces in href truncate the URL in browsers
  const daddr = [...mids.map((p) => `${p.lat},${p.lng}`), saddr].join('+to:')
  return `https://maps.apple.com/?saddr=${saddr}&daddr=${daddr}&dirflg=${dirflg}`
}
