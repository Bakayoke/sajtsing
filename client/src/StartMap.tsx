import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export type LatLng = { lat: number; lng: number }

type Props = {
  start: LatLng | null
  onPick?: (point: LatLng) => void
  routeCoords?: [number, number][] | null
  interactive?: boolean
}

const pinIcon = L.divIcon({
  className: 'start-pin',
  html: '<span class="start-pin-dot"></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
})

export default function StartMap({
  start,
  onPick,
  routeCoords,
  interactive = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const routeRef = useRef<L.Polyline | null>(null)
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: true,
    }).setView([59.33, 18.07], 13)

    L.control.zoom({ position: 'topright' }).addTo(map)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (!onPickRef.current) return
      onPickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng })
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
      routeRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.off('click')
    if (!interactive) return
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (!onPickRef.current) return
      onPickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng })
    })
  }, [interactive])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !start) return

    if (!markerRef.current) {
      markerRef.current = L.marker([start.lat, start.lng], {
        icon: pinIcon,
        draggable: interactive,
      }).addTo(map)

      markerRef.current.on('dragend', () => {
        const pos = markerRef.current?.getLatLng()
        if (pos && onPickRef.current) {
          onPickRef.current({ lat: pos.lat, lng: pos.lng })
        }
      })

      map.setView([start.lat, start.lng], 14)
    } else {
      markerRef.current.setLatLng([start.lat, start.lng])
      if (markerRef.current.dragging) {
        if (interactive) markerRef.current.dragging.enable()
        else markerRef.current.dragging.disable()
      }
    }
  }, [start, interactive])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (routeRef.current) {
      map.removeLayer(routeRef.current)
      routeRef.current = null
    }

    if (!routeCoords?.length) return

    // GeoJSON is [lng, lat]
    const latLngs = routeCoords.map(([lng, lat]) => L.latLng(lat, lng))
    routeRef.current = L.polyline(latLngs, {
      color: '#0f6b4c',
      weight: 4,
      opacity: 0.85,
    }).addTo(map)

    map.fitBounds(routeRef.current.getBounds(), { padding: [28, 28] })
  }, [routeCoords])

  return <div ref={containerRef} className="start-map" role="presentation" />
}
