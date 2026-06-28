import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { createServer as createViteServer } from 'vite'
import { fileURLToPath } from 'url'
import path from 'path'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = Number(process.env.PORT || 8787)
const AUTH_TOKEN = process.env.AUTH_TOKEN || ''
const BUCKET = process.env.SPACES_BUCKET || ''
const KEY = process.env.SPACES_OBJECT_KEY || 'weekly/staffboard-2/staffboard-state.json'
const ENDPOINT = process.env.SPACES_ENDPOINT || ''
const REGION = process.env.SPACES_REGION || 'us-east-1'
const ACCESS_KEY = process.env.SPACES_KEY || ''
const SECRET_KEY = process.env.SPACES_SECRET || ''

const spacesConfigured = Boolean(BUCKET && ENDPOINT && ACCESS_KEY && SECRET_KEY)

const s3 = spacesConfigured ? new S3Client({
  endpoint: ENDPOINT,
  region: REGION,
  credentials: {
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
  },
}) : null

const app = express()
app.use(cors())
app.use(express.json({ limit: '12mb' }))

function requireToken(req, res, next) {
  if (!AUTH_TOKEN) return next()
  const auth = req.headers.authorization || ''
  const headerToken = req.headers['x-auth-token'] || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : headerToken
  if (token !== AUTH_TOKEN) return res.status(401).json({ error: 'Unauthorized' })
  next()
}

async function streamToString(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf-8')
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    authConfigured: Boolean(AUTH_TOKEN),
    spacesConfigured,
    bucket: BUCKET || null,
    objectKey: KEY || null,
    endpoint: ENDPOINT || null,
    region: REGION || null,
  })
})

app.get('/api/state', requireToken, async (req, res) => {
  try {
    if (!s3) return res.status(500).json({ error: 'Spaces is not configured' })
    const out = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: KEY }))
    const txt = await streamToString(out.Body)
    res.json(JSON.parse(txt))
  } catch (err) {
    const name = String(err?.name || err?.Code || '')
    if (name.includes('NoSuchKey') || err?.$metadata?.httpStatusCode === 404) {
      return res.json({ state: {}, updatedAt: '' })
    }
    console.error(err)
    res.status(500).json({ error: err.message || 'Failed to load state from Spaces.' })
  }
})

app.put('/api/state', requireToken, async (req, res) => {
  try {
    if (!s3) return res.status(500).json({ error: 'Spaces is not configured' })
    const payload = {
      state: req.body?.state || {},
      updatedAt: new Date().toISOString(),
    }
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: KEY,
      Body: JSON.stringify(payload, null, 2),
      ContentType: 'application/json',
    }))
    res.json(payload)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Failed to save state to Spaces.' })
  }
})

app.post('/api/state', requireToken, async (req, res) => {
  try {
    if (!s3) return res.status(500).json({ error: 'Spaces is not configured' })
    const payload = {
      state: req.body?.state || {},
      updatedAt: new Date().toISOString(),
    }
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: KEY,
      Body: JSON.stringify(payload, null, 2),
      ContentType: 'application/json',
    }))
    res.json(payload)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Failed to save state to Spaces.' })
  }
})

async function start() {
  const vite = await createViteServer({
    root: __dirname,
    server: { middlewareMode: true },
    appType: 'spa',
  })
  app.use(vite.middlewares)
  app.listen(PORT, () => {
    console.log(`StaffBoard V6 running on http://localhost:${PORT}`)
    console.log(`Auth configured: ${Boolean(AUTH_TOKEN)}`)
    console.log(`Saving to DigitalOcean Spaces: ${spacesConfigured} ${BUCKET}/${KEY}`)
  })
}

start()
