/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url' {
  const url: string
  export default url
}
