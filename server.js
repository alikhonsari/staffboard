import express from 'express'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const app = express()
const PORT = Number(process.env.PORT || 8787)

app.use(express.json({ limit: '25mb' }))

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

app.get('/api/state', async (req, res) => {
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

app.post('/api/state', async (req, res) => {
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
  if (s3) console.log(`Saving to DigitalOcean Spaces bucket ${bucket}, key ${stateKey}`)
  else console.log('Spaces not configured; browser localStorage still works.')
})
