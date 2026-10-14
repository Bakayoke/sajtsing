import express from 'express'
import cors from 'cors'
import { createRoute } from './routes.js'

const PORT = Number(process.env.PORT) || 3001

const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://sajtsing.com',
  'https://www.sajtsing.com',
  'https://sajtsing.linus-stenvi.workers.dev',
]

const corsOrigins = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const allowedOrigins = [...new Set([...defaultOrigins, ...corsOrigins])]

const app = express()
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
      return cb(new Error(`CORS blocked: ${origin}`))
    },
  }),
)
app.use(express.json({ limit: '32kb' }))

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'sajtsing',
    orsConfigured: Boolean(process.env.ORS_API_KEY),
  })
})

app.post('/v1/routes', async (req, res) => {
  try {
    const route = await createRoute(req.body)
    res.json(route)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message.startsWith('Invalid') ? 422 : 502
    res.status(status).json({ error: message })
  }
})

app.listen(PORT, () => {
  console.log(`Sajtsing API on :${PORT}`)
})
