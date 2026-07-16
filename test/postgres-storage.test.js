import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const store = fs.readFileSync(new URL('../postgres-json-store.js', import.meta.url), 'utf8')
const runtime = fs.readFileSync(new URL('../guarded-server-runtime.js', import.meta.url), 'utf8')
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8')
const platformConfig = fs.readFileSync(new URL('../platform/config.js', import.meta.url), 'utf8')
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

const forbiddenSecrets = [
  'AVNS_',
  'app-4f65a4e6-493e-4fc2-b185-e0853017ea28-do-user-10612034-0.k.db.ondigitalocean.com',
]

test('PostgreSQL credentials are environment-only and never embedded in source', () => {
  const combined = [store, runtime, server, platformConfig, JSON.stringify(packageJson)].join('\n')
  for (const secret of forbiddenSecrets) assert.doesNotMatch(combined, new RegExp(secret))
  assert.match(store, /process\.env\.DATABASE_URL/)
  assert.match(store, /process\.env\.PGHOST/)
  assert.match(store, /process\.env\.PGPASSWORD/)
})

test('PostgreSQL pool uses SSL, bounded connections, and connection timeout', () => {
  assert.match(store, /new Pool\(/)
  assert.match(store, /STAFFBOARD_PG_POOL_MAX/)
  assert.match(store, /connectionTimeoutMillis/)
  assert.match(store, /rejectUnauthorized: false/)
  assert.match(store, /application_name: 'staffboard'/)
})

test('document schema is created idempotently and JSON writes use parameterized upserts', () => {
  assert.match(store, /CREATE TABLE IF NOT EXISTS staffboard_documents/)
  assert.match(store, /object_key TEXT PRIMARY KEY/)
  assert.match(store, /payload JSONB NOT NULL/)
  assert.match(store, /ON CONFLICT \(object_key\)/)
  assert.match(store, /\$1, \$2::jsonb/)
})

test('history updates are transactional and row locked', () => {
  assert.match(store, /BEGIN/)
  assert.match(store, /FOR UPDATE/)
  assert.match(store, /COMMIT/)
  assert.match(store, /ROLLBACK/)
  assert.match(runtime, /updateJsonDocument\(config\.historyKey/)
})

test('guarded runtime and base API use PostgreSQL rather than Spaces persistence', () => {
  assert.match(runtime, /storageBackend: 'postgres'/)
  assert.match(runtime, /postgresConfigured: postgresStoreConfig\.configured/)
  assert.doesNotMatch(runtime, /new S3Client|GetObjectCommand|PutObjectCommand|DeleteObjectCommand/)
  assert.match(server, /getJsonDocument/)
  assert.match(server, /putJsonDocument/)
  assert.doesNotMatch(server, /new S3Client|GetObjectCommand|PutObjectCommand/)
})

test('optional Spaces import is read-only and explicitly enabled', () => {
  assert.match(store, /STAFFBOARD_POSTGRES_IMPORT_SPACES/)
  assert.match(store, /GetObjectCommand/)
  assert.doesNotMatch(store, /PutObjectCommand|DeleteObjectCommand/)
  assert.match(store, /await putJsonDocument\(key, imported\)/)
})

test('production validation requires PostgreSQL instead of Spaces', () => {
  assert.match(platformConfig, /Production PostgreSQL storage is not configured/)
  assert.doesNotMatch(platformConfig, /Production DigitalOcean Spaces storage is not fully configured/)
  assert.equal(packageJson.dependencies.pg, '^8.13.3')
  assert.equal(packageJson.version, '1.6.20')
})
