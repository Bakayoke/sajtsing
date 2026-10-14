# Sajtsing

En rutt för den tid du har — ange start (GPS), tid och färdsätt, få en loop och öppna den i Maps (inkl. bilnavigation).

**Domän:** [sajtsing.com](https://sajtsing.com)

## Stack

- **Client:** React + Vite → Cloudflare (Workers Assets / `wrangler`)
- **Server:** Express (tunn ORS-proxy) → Railway
- **Routing:** [OpenRouteService](https://openrouteservice.org/)

Samma upplägg som Factopia / Kluddkrig m.fl.: frontend på Cloudflare, API på Railway.

## Lokal utveckling

```bash
cp .env.example .env
# Fyll i ORS_API_KEY (se nedan)

npm install
npm install --prefix client
npm run dev
```

Öppna [http://localhost:5173](http://localhost:5173) — API på `:3001` (Vite proxar `/v1` och `/api`).

## Produktion

### 1. Railway (API)

**URL:** `https://sajtsing-production.up.railway.app`

1. Tjänst från GitHub `Bakayoke/sajtsing`, start: `npm start` (repo-root).
2. Variabler enligt **API-nycklar & Railway-variabler** nedan.
3. Verifiera: [health](https://sajtsing-production.up.railway.app/api/health) → `orsConfigured: true`.

### 2. Cloudflare (frontend)

`client/.env.production` pekar redan på Railway:

```bash
VITE_API_URL=https://sajtsing-production.up.railway.app
```

Deploy:

```bash
npm run deploy:cf
```

Custom domains `sajtsing.com` / `www` sätts via `routes` i `wrangler.toml`.

---

## API-nycklar & Railway-variabler (steg för steg)

Du behöver **en** extern API-nyckel för MVP: OpenRouteService.

### A. Skapa OpenRouteService-nyckel

1. Gå till [https://openrouteservice.org/dev/#/signup](https://openrouteservice.org/dev/#/signup) och skapa konto.
2. Logga in → **Dashboard** → **Tokens** / **API Key**.
3. Skapa en token (namn t.ex. `sajtsing-prod`).
4. Kopiera nyckeln (lång sträng).

Gratisnivån räcker långt för hobby/MVP (begränsat antal requests/dag).

### B. Lägg in variabler i Railway

Railway → din tjänst → **Variables** → lägg till:

| Variabel | Obligatorisk | Exempel | Vad den gör |
|----------|--------------|---------|-------------|
| `ORS_API_KEY` | **Ja** | `eyJ…` / din ORS-token | Anrop till OpenRouteService (får **inte** ligga i frontend) |
| `CORS_ORIGIN` | Rekommenderas | `https://sajtsing.com,https://www.sajtsing.com` | Tillåter webbläsaranrop från sajten (defaults finns också i koden) |
| `PUBLIC_APP_URL` | Valfri | `https://sajtsing.com` | Bokföring / framtida länkar |
| `PORT` | Nej | *(Railway sätter själv)* | Lyssningsport |

Lokalt: samma nycklar i `.env` i repo-roten (filen är gitignored).

### C. Frontend → API

Redan satt i `client/.env.production`:

`VITE_API_URL=https://sajtsing-production.up.railway.app`

### D. Det du *inte* behöver i v1

- Ingen Mapbox-nyckel (export går via deep links; karta i appen kan komma senare)
- Ingen Google Maps Platform-nyckel (vi öppnar bara Maps-URL:er)
- Ingen databas / Redis
- Ingen auth-nyckel

### E. Snabbchecklist

- [ ] `ORS_API_KEY` satt i Railway  
- [ ] [Health](https://sajtsing-production.up.railway.app/api/health) → `orsConfigured: true`  
- [ ] `npm run deploy:cf` efter ändringar i klienten  
- [ ] Domän `sajtsing.com` på Cloudflare-workern  

## API

`POST /v1/routes`

```json
{
  "start": { "lat": 59.33, "lng": 18.07 },
  "durationMinutes": 45,
  "mode": "walk"
}
```

Modes: `walk` | `run` | `bike` | `drive`.

Svar innehåller `geometry`, förenklade `waypoints` och `export.googleMapsUrl` / `export.appleMapsUrl`.

`GET /api/health` — status + om ORS-nyckel finns.
