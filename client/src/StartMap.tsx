import { useEffect, useRef } from 'react'
import {
  Map,
  Marker,
  NavigationControl,
  LngLatBounds,
  setWorkerUrl,
  type GeoJSONSource,
} from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'

setWorkerUrl(workerUrl)

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

const STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/liberty'
/** Fiord is a softer dark blue-gray — more readable than pitch-black "dark". */
const STYLE_DARK = 'https://tiles.openfreemap.org/styles/fiord'

function prefersDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

function styleUrl() {
  return prefersDark() ? STYLE_DARK : STYLE_LIGHT
}

function makePinElement(kind: 'start' | 'end') {
  const wrap = document.createElement('div')
  wrap.className = `map-pin ${kind}-pin`
  wrap.innerHTML = `<span class="map-pin-dot ${kind}-pin-dot"></span>`
  return wrap
}

function ensureRouteLayer(map: Map, color: string) {
  if (!map.getSource('route')) {
    map.addSource('route', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
  }
  if (!map.getLayer('route-line')) {
    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': color,
        'line-width': 4.5,
        'line-opacity': 0.92,
      },
    })
  } else {
    map.setPaintProperty('route-line', 'line-color', color)
  }
}

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
  const mapRef = useRef<Map | null>(null)
  const startMarkerRef = useRef<Marker | null>(null)
  const endMarkerRef = useRef<Marker | null>(null)
  const styleReadyRef = useRef(false)
  const pickTargetRef = useRef(pickTarget)
  const onPickStartRef = useRef(onPickStart)
  const onPickEndRef = useRef(onPickEnd)
  const interactiveRef = useRef(interactive)
  const routeColorRef = useRef(routeColor)
  const routeCoordsRef = useRef(routeCoords)
  pickTargetRef.current = pickTarget
  onPickStartRef.current = onPickStart
  onPickEndRef.current = onPickEnd
  interactiveRef.current = interactive
  routeColorRef.current = routeColor
  routeCoordsRef.current = routeCoords

  const paintRoute = () => {
    const map = mapRef.current
    if (!map || !styleReadyRef.current) return
    ensureRouteLayer(map, routeColorRef.current)
    const source = map.getSource('route') as GeoJSONSource | undefined
    const coords = routeCoordsRef.current
    if (!source) return

    if (!coords?.length) {
      source.setData({ type: 'FeatureCollection', features: [] })
      return
    }

    source.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: coords },
    })

    const bounds = new LngLatBounds()
    for (const [lng, lat] of coords) bounds.extend([lng, lat])
    map.fitBounds(bounds, { padding: 36, maxZoom: 15, duration: 500 })
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new Map({
      container: containerRef.current,
      style: styleUrl(),
      center: [18.07, 59.33],
      zoom: 12.5,
      // Attribution shown in app footer instead (keeps map chrome clean)
      attributionControl: false,
    })

    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')

    map.on('load', () => {
      styleReadyRef.current = true
      paintRoute()
    })

    map.on('click', (e) => {
      if (!interactiveRef.current) return
      const point = { lat: e.lngLat.lat, lng: e.lngLat.lng }
      if (pickTargetRef.current === 'end') onPickEndRef.current?.(point)
      else onPickStartRef.current?.(point)
    })

    mapRef.current = map

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onTheme = () => {
      styleReadyRef.current = false
      map.setStyle(styleUrl())
      map.once('style.load', () => {
        styleReadyRef.current = true
        paintRoute()
      })
    }
    mq.addEventListener('change', onTheme)

    return () => {
      mq.removeEventListener('change', onTheme)
      startMarkerRef.current?.remove()
      endMarkerRef.current?.remove()
      startMarkerRef.current = null
      endMarkerRef.current = null
      map.remove()
      mapRef.current = null
      styleReadyRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!start) {
      startMarkerRef.current?.remove()
      startMarkerRef.current = null
      return
    }

    if (!startMarkerRef.current) {
      const marker = new Marker({
        element: makePinElement('start'),
        draggable: interactive,
        anchor: 'center',
      })
        .setLngLat([start.lng, start.lat])
        .addTo(map)

      marker.on('dragend', () => {
        const ll = marker.getLngLat()
        onPickStartRef.current?.({ lat: ll.lat, lng: ll.lng })
      })
      startMarkerRef.current = marker

      if (!routeCoordsRef.current?.length && !end) {
        map.easeTo({ center: [start.lng, start.lat], zoom: 13.5, duration: 400 })
      }
    } else {
      startMarkerRef.current.setLngLat([start.lng, start.lat])
      startMarkerRef.current.setDraggable(interactive)
    }
  }, [start, interactive, end])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!end) {
      endMarkerRef.current?.remove()
      endMarkerRef.current = null
      return
    }

    if (!endMarkerRef.current) {
      const marker = new Marker({
        element: makePinElement('end'),
        draggable: interactive,
        anchor: 'center',
      })
        .setLngLat([end.lng, end.lat])
        .addTo(map)

      marker.on('dragend', () => {
        const ll = marker.getLngLat()
        onPickEndRef.current?.({ lat: ll.lat, lng: ll.lng })
      })
      endMarkerRef.current = marker
    } else {
      endMarkerRef.current.setLngLat([end.lng, end.lat])
      endMarkerRef.current.setDraggable(interactive)
    }

    if (!routeCoordsRef.current?.length && start) {
      const bounds = new LngLatBounds([start.lng, start.lat], [end.lng, end.lat])
      map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 400 })
    }
  }, [end, interactive, start])

  useEffect(() => {
    paintRoute()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeCoords, routeColor])

  return <div ref={containerRef} className="start-map" role="presentation" />
}
