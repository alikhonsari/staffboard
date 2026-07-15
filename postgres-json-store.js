import { Pool } from 'pg'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'

const clean = (value) => String(value || '').trim()

const databaseUrl = clean(process.env.DATABASE_URL)
const pgSslMode = clean(process.env.PGSSLMODE || 'require').toLowerCase()
const postgresConfigured = Boolean(databaseUrl || (
  clean(process.env.PGHOST) && clean(process.env.PGUSER) && clean(process.env.PGPASSWORD) && clean(process.env.PGDATABASE)
))

const pool = postgresConfigured ? new Pool({
  ...(databaseUrl ? { connectionString: databaseUrl } : {
    host: clean(process.env.PGHOST),
    port: Number(process.env.PGPORT || 5432),
    user: clean(process.env.PGUSER),
    password: process.env.PGPASSWORD || '',
    database: clean(process.env.PGDATABASE),
  }),
  max: Number(process.env.STAFFBOARD_PG_POOL_MAX || 8),
  idleTimeoutMillis: Number(process.env.STAFFBOARD_PG_IDLE_TIMEOUT_MS || 30_000),
  connectionTimeoutMillis: Number(process.env.STAFFBOARD_PG_CONNECT_TIMEOUT_MS || 10_000),
  ssl: pgSslMode === 'disable' ? false : { rejectUnauthorized: false },
  application_name: 'staffboard',
}) : null

const spacesConfig = {
  bucket: clean(process.env.SPACES_BUCKET),
  endpoint: clean(process.env.SPACES_ENDPOINT),
  region: clean(process.env.SPACES_REGION || 'us-east-1'),
  accessKey: clean(process.env.SPACES_KEY),
  secretKey: process.env.SPACES_SECRET || '',
}
const spacesConfigured = Boolean(spacesConfig.bucket && spacesConfig.endpoint && spacesConfig.accessKey && spacesConfig.secretKey)
const importFromSpaces = String(process.env.STAFFBOARD_POSTGRES_IMPORT_SPACES || '').toLowerCase() === 'true'
const s3 = importFromSpaces && spacesConfigured ? new S3Client({
  endpoint: spacesConfig.endpoint,
  region: spacesConfig.region,
  credentials: { accessKeyId: spacesConfig.accessKey, secretAccessKey: spacesConfig.secretKey },
}) : null

let schemaPromise = null

function assertConfigured() {
  if (!pool) throw new Error('PostgreSQL is not configured. Set DATABASE_URL or PGHOST, PGPORT, PGDATABASE, PGUSER, and PGPASSWORD.')
}

async function ensureSchema() {
  assertConfigured()
  if (!schemaPromise) {
    schemaPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS staffboard_documents (
        object_key TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS staffboard_documents_updated_at_idx
        ON staffboard_documents (updated_at DESC);
    `).catch((error) => {
      schemaPromise = null
      throw error
    })
  }
  await schemaPromise
}

async function streamToString(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

async function readSpacesJson(key, fallback) {
  if (!s3) return fallback
  try {
    const output = await s3.send(new GetObjectCommand({ Bucket: spacesConfig.bucket, Key: key }))
    const text = await streamToString(output.Body)
    return text ? JSON.parse(text) : fallback
  } catch (error) {
    const name = String(error?.name || error?.Code || '')
    if (name.includes('NoSuchKey') || error?.$metadata?.httpStatusCode === 404) return fallback
    throw error
  }
}

export const postgresStoreConfig = {
  configured: postgresConfigured,
  sslMode: pgSslMode,
  poolMax: Number(process.env.STAFFBOARD_PG_POOL_MAX || 8),
  importFromSpaces,
  spacesImportAvailable: Boolean(s3),
}

export async function getJsonDocument(key, fallback) {
  await ensureSchema()
  const result = await pool.query('SELECT payload FROM staffboard_documents WHERE object_key = $1', [key])
  if (result.rowCount) return result.rows[0].payload

  if (importFromSpaces && s3) {
    const imported = await readSpacesJson(key, fallback)
    if (imported !== fallback) {
      await putJsonDocument(key, imported)
      return imported
    }
  }
  return fallback
}

export async function putJsonDocument(key, payload) {
  await ensureSchema()
  await pool.query(`
    INSERT INTO staffboard_documents (object_key, payload, updated_at)
    VALUES ($1, $2::jsonb, NOW())
    ON CONFLICT (object_key)
    DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
  `, [key, JSON.stringify(payload)])
}

export async function deleteJsonDocument(key) {
  await ensureSchema()
  await pool.query('DELETE FROM staffboard_documents WHERE object_key = $1', [key])
}

export async function updateJsonDocument(key, fallback, updater) {
  await ensureSchema()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const selected = await client.query('SELECT payload FROM staffboard_documents WHERE object_key = $1 FOR UPDATE', [key])
    let current = selected.rowCount ? selected.rows[0].payload : fallback
    if (!selected.rowCount && importFromSpaces && s3) current = await readSpacesJson(key, fallback)
    const next = await updater(current)
    await client.query(`
      INSERT INTO staffboard_documents (object_key, payload, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (object_key)
      DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
    `, [key, JSON.stringify(next)])
    await client.query('COMMIT')
    return next
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function postgresHealth() {
  const started = Date.now()
  try {
    await ensureSchema()
    await pool.query('SELECT 1')
    return { ok: true, configured: true, latencyMs: Date.now() - started }
  } catch (error) {
    return { ok: false, configured: postgresConfigured, latencyMs: Date.now() - started, error: error.message }
  }
}

export async function closePostgresStore() {
  if (pool) await pool.end()
}
