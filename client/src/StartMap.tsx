import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export type LatLng = { lat: number; lng: number }
export type PickTarget = 'start' | 'end'

type Props = {
  start: LatLng | null
  end?: LatLng | null
  pickTarget?: PickTarget
  onPickStart?: (point: LatLng) => void
  onPickEnd?: (point: LatLng) => void
  routeCoords?: [number, number][] | null
  interactive?: boolean
  routeColor?: string
}

const startIcon = L.divIcon({
  className: 'map-pin start-pin',
  html: '<span class="map-pin-dot start-pin-dot"></span>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
})

const endIcon = L.divIcon({
  className: 'map-pin end-pin',
  html: '<span class="map-pin-dot end-pin-dot"></span>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
})

export default function StartMap({
  start,
  end = null,
  pickTarget = 'start',
  onPickStart,
  onPickEnd,
  routeCoords,
  interactive = true,
  routeColor = '#ff5a1f',
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const startMarkerRef = useRef<L.Marker | null>(null)
  const endMarkerRef = useRef<L.Marker | null>(null)
  const routeRef = useRef<L.Polyline | null>(null)
  const pickTargetRef = useRef(pickTarget)
  const onPickStartRef = useRef(onPickStart)
  const onPickEndRef = useRef(onPickEnd)
  pickTargetRef.current = pickTarget
  onPickStartRef.current = onPickStart
  onPickEndRef.current = onPickEnd

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: true,
    }).setView([59.33, 18.07], 13)

    L.control.zoom({ position: 'topright' }).addTo(map)

    // Free OSM tiles — no API key. Dark look is handled via CSS filter.
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)

    map.on('click', (e: L.LeafletMouseEvent) => {
      const point = { lat: e.latlng.lat, lng: e.latlng.lng }
      if (pickTargetRef.current === 'end') onPickEndRef.current?.(point)
      else onPickStartRef.current?.(point)
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      startMarkerRef.current = null
      endMarkerRef.current = null
      routeRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.off('click')
    if (!interactive) return
    map.on('click', (e: L.LeafletMouseEvent) => {
      const point = { lat: e.latlng.lat, lng: e.latlng.lng }
      if (pickTargetRef.current === 'end') onPickEndRef.current?.(point)
      else onPickStartRef.current?.(point)
    })
  }, [interactive])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!start) {
      if (startMarkerRef.current) {
        map.removeLayer(startMarkerRef.current)
        startMarkerRef.current = null
      }
      return
    }

    if (!startMarkerRef.current) {
      startMarkerRef.current = L.marker([start.lat, start.lng], {
        icon: startIcon,
        draggable: interactive,
      }).addTo(map)

      startMarkerRef.current.on('dragend', () => {
        const pos = startMarkerRef.current?.getLatLng()
        if (pos) onPickStartRef.current?.({ lat: pos.lat, lng: pos.lng })
      })
    } else {
      startMarkerRef.current.setLatLng([start.lat, start.lng])
      if (startMarkerRef.current.dragging) {
        if (interactive) startMarkerRef.current.dragging.enable()
        else startMarkerRef.current.dragging.disable()
      }
    }
  }, [start, interactive])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!end) {
      if (endMarkerRef.current) {
        map.removeLayer(endMarkerRef.current)
        endMarkerRef.current = null
      }
      return
    }

    if (!endMarkerRef.current) {
      endMarkerRef.current = L.marker([end.lat, end.lng], {
        icon: endIcon,
        draggable: interactive,
      }).addTo(map)

      endMarkerRef.current.on('dragend', () => {
        const pos = endMarkerRef.current?.getLatLng()
        if (pos) onPickEndRef.current?.({ lat: pos.lat, lng: pos.lng })
      })
    } else {
      endMarkerRef.current.setLatLng([end.lat, end.lng])
      if (endMarkerRef.current.dragging) {
        if (interactive) endMarkerRef.current.dragging.enable()
        else endMarkerRef.current.dragging.disable()
      }
    }
  }, [end, interactive])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (routeRef.current) {
      map.removeLayer(routeRef.current)
      routeRef.current = null
    }

    if (!routeCoords?.length) {
      if (start && end) {
        map.fitBounds(L.latLngBounds([start.lat, start.lng], [end.lat, end.lng]), {
          padding: [40, 40],
          maxZoom: 14,
        })
      } else if (start) {
        map.setView([start.lat, start.lng], 14)
      }
      return
    }

    const latLngs = routeCoords.map(([lng, lat]) => L.latLng(lat, lng))
    routeRef.current = L.polyline(latLngs, {
      color: routeColor,
      weight: 4,
      opacity: 0.88,
    }).addTo(map)

    map.fitBounds(routeRef.current.getBounds(), { padding: [28, 28] })
  }, [routeCoords, routeColor, start, end])

  return <div ref={containerRef} className="start-map" role="presentation" />
}
