import express from 'express'
import dotenv from 'dotenv'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const app = express()
const PORT = Number(process.env.PORT || 8787)

app.use(express.json({ limit: '25mb' }))

function cleanAuthValue(value) {
  return String(value || '').trim()
}

const authSecret = process.env.STAFFBOARD_AUTH_SECRET || process.env.DO_SPACES_SECRET || 'change-this-secret'
const defaultAdminUser = cleanAuthValue(process.env.STAFFBOARD_ADMIN_USER || 'admin')
const defaultAdminPass = cleanAuthValue(process.env.STAFFBOARD_ADMIN_PASS || '')

function getAdminUsers() {
  const users = []

  if (defaultAdminUser && defaultAdminPass) {
    users.push({ username: defaultAdminUser, password: defaultAdminPass, role: 'admin', source: 'STAFFBOARD_ADMIN_USER/PASS' })
  }

  if (process.env.STAFFBOARD_ADMINS_JSON) {
    try {
      const parsed = JSON.parse(process.env.STAFFBOARD_ADMINS_JSON)
      if (Array.isArray(parsed)) {
        parsed.forEach((user) => {
          const username = cleanAuthValue(user?.username)
          const password = cleanAuthValue(user?.password)
          if (username && password) {
            users.push({ username, password, role: user.role || 'admin', source: 'STAFFBOARD_ADMINS_JSON' })
          }
        })
      }
    } catch (err) {
      console.warn('Invalid STAFFBOARD_ADMINS_JSON. Use valid JSON or STAFFBOARD_ADMIN_USER/PASS.')
    }
  }

  const seen = new Set()
  return users.filter((user) => {
    const key = `${user.username}:${user.password}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', authSecret).update(body).digest('base64url')
  return `${body}.${sig}`
}

function verifyToken(token) {
  try {
    if (!token || !token.includes('.')) return null
    const [body, sig] = token.split('.')
    const expected = crypto.createHmac('sha256', authSecret).update(body).digest('base64url')
    if (Buffer.byteLength(sig) !== Buffer.byteLength(expected)) return null
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'))
    if (payload.exp && Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const payload = verifyToken(token)
  if (!payload) return res.status(401).json({ error: 'Unauthorized' })
  req.user = payload
  next()
}

app.get('/api/auth/status', (req, res) => {
  const users = getAdminUsers()
  res.json({
    configured: users.length > 0,
    usernames: users.map((user) => user.username),
    adminUserEnvPresent: Boolean(process.env.STAFFBOARD_ADMIN_USER),
    adminPassEnvPresent: Boolean(process.env.STAFFBOARD_ADMIN_PASS),
    adminsJsonPresent: Boolean(process.env.STAFFBOARD_ADMINS_JSON),
    authSecretPresent: Boolean(process.env.STAFFBOARD_AUTH_SECRET),
  })
})

app.post('/api/login', (req, res) => {
  const username = cleanAuthValue(req.body?.username)
  const password = cleanAuthValue(req.body?.password)
  const users = getAdminUsers()
  const found = users.find((u) => u.username === username && u.password === password)
  if (!found) {
    return res.status(401).json({
      error: 'Invalid username or password',
      configured: users.length > 0,
      configuredUsernames: users.map((user) => user.username),
    })
  }
  const token = signToken({
    username: found.username,
    role: found.role || 'admin',
    exp: Date.now() + 1000 * 60 * 60 * 12,
  })
  return res.json({ token, user: { username: found.username, role: found.role || 'admin' } })
})

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: { username: req.user.username, role: req.user.role } })
})

const bucket = process.env.DO_SPACES_BUCKET || ''
const region = process.env.DO_SPACES_REGION || 'nyc3'
const endpoint = process.env.DO_SPACES_ENDPOINT || `https://${region}.digitaloceanspaces.com`
const keyPrefix = process.env.DO_SPACES_KEY_PREFIX || 'staffboard-2/'
const stateKey = `${keyPrefix.replace(/\/?$/, '/') }state.json`

let s3 = null
if (process.env.DO_SPACES_KEY && process.env.DO_SPACES_SECRET && bucket) {
  s3 = new S3Client({
    region,
    endpoint,
    credentials: {
      accessKeyId: process.env.DO_SPACES_KEY,
      secretAccessKey: process.env.DO_SPACES_SECRET,
    },
  })
}

async function streamToString(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf-8')
}

app.get('/api/state', requireAuth, async (req, res) => {
  try {
    if (!s3) return res.json({ state: null, source: 'local/no-spaces' })
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: stateKey }))
    const raw = await streamToString(obj.Body)
    return res.json({ state: JSON.parse(raw), source: 'spaces', key: stateKey })
  } catch (err) {
    if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) return res.json({ state: null, source: 'spaces-empty' })
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
})

app.post('/api/state', requireAuth, async (req, res) => {
  try {
    if (!s3) return res.json({ ok: true, source: 'local/no-spaces' })
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: stateKey,
      Body: JSON.stringify(req.body.state || req.body, null, 2),
      ContentType: 'application/json',
    }))
    return res.json({ ok: true, source: 'spaces', key: stateKey })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
})

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')))
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')))
} else {
  const { createServer } = await import('vite')
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'spa',
    root: __dirname,
  })
  app.use(vite.middlewares)
}

app.listen(PORT, () => {
  console.log(`StaffBoard 2.0 running on http://localhost:${PORT}`)
  console.log(`Auth configured for ${getAdminUsers().length} admin user(s).`)
  if (s3) console.log(`Saving to DigitalOcean Spaces bucket ${bucket}, key ${stateKey}`)
  else console.log('Spaces not configured; browser localStorage still works.')
})
