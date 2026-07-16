import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

function readPackageVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
    return String(pkg.version || '0.0.0')
  } catch {
    return '0.0.0'
  }
}

const asNumber = (value, fallback) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

export const platformConfig = Object.freeze({
  version: readPackageVersion(),
  environment: process.env.NODE_ENV || 'development',
  commit: process.env.GIT_COMMIT_SHA || process.env.COMMIT_SHA || process.env.SOURCE_VERSION || '',
  buildTime: process.env.BUILD_TIME || '',
  validationMode: process.env.STAFFBOARD_VALIDATION_MODE || 'compatible',
  stateWarningBytes: asNumber(process.env.STAFFBOARD_STATE_WARNING_BYTES, 8 * 1024 * 1024),
  saveLatencyWarningMs: asNumber(process.env.STAFFBOARD_SAVE_LATENCY_WARNING_MS, 2000),
  readinessTimeoutMs: asNumber(process.env.STAFFBOARD_READINESS_TIMEOUT_MS, 5000),
  shutdownTimeoutMs: asNumber(process.env.STAFFBOARD_SHUTDOWN_TIMEOUT_MS, 10000),
})

function hasNumberedAdmin(env = {}) {
  return Object.keys(env).some((key) => {
    const match = key.match(/^STAFFBOARD_ADMIN_(\d+)_USER$/)
    if (!match || !String(env[key] || '').trim()) return false
    return Boolean(String(env[`STAFFBOARD_ADMIN_${match[1]}_PASS`] || '').trim())
  })
}

export function validateEnvironment(baseConfig = {}, env = process.env) {
  const production = (env.NODE_ENV || '').toLowerCase() === 'production'
  const errors = []
  const warnings = []
  const hasAuth = Boolean(
    env.AUTH_TOKEN || env.ADMINS_JSON || env.STAFFBOARD_ADMINS_JSON ||
    env.STAFFBOARD_ADMIN_USER || env.ADMIN_USER || hasNumberedAdmin(env),
  )
  const hasSessionSecret = Boolean(env.AUTH_SECRET || env.STAFFBOARD_SESSION_SECRET || env.AUTH_TOKEN)
  const hasDatabaseUrl = Boolean(String(env.DATABASE_URL || '').trim())
  const hasPgParts = Boolean(env.PGHOST && env.PGUSER && env.PGPASSWORD && env.PGDATABASE)
  const hasPostgres = Boolean(baseConfig.postgresConfigured || hasDatabaseUrl || hasPgParts)

  if (production && !hasAuth) errors.push('Production authentication is not configured.')
  if (production && !hasSessionSecret) errors.push('Production session signing is not configured. Set AUTH_SECRET or STAFFBOARD_SESSION_SECRET.')
  if (production && !hasPostgres) errors.push('Production PostgreSQL storage is not configured. Set DATABASE_URL or PGHOST, PGPORT, PGDATABASE, PGUSER, and PGPASSWORD.')
  if (!production && !hasAuth) warnings.push('Authentication is not configured; development access may be unavailable.')
  if (!production && !hasSessionSecret) warnings.push('Session signing secret is not configured; the development fallback will be used.')
  if (!hasPostgres) warnings.push('PostgreSQL storage is not configured.')
  if (!baseConfig.timeZone) warnings.push('Site timezone is not configured.')
  if ((env.AUTH_SECRET || env.STAFFBOARD_SESSION_SECRET || '') === 'staffboard-dev-secret') warnings.push('Default development auth secret is in use.')

  return { ok: errors.length === 0, production, errors, warnings }
}

export function safeConfigSummary(baseConfig = {}, extras = {}) {
  return {
    applicationVersion: platformConfig.version,
    commit: platformConfig.commit || null,
    buildTime: platformConfig.buildTime || null,
    environment: platformConfig.environment,
    validationMode: platformConfig.validationMode,
    timezone: baseConfig.timeZone || null,
    authConfigured: Boolean(baseConfig.authToken || baseConfig.authSecret),
    storageBackend: baseConfig.storageBackend || 'postgres',
    postgresConfigured: Boolean(baseConfig.postgresConfigured),
    stateObjectKey: baseConfig.key || null,
    historyObjectKey: baseConfig.historyKey || null,
    stateWarningBytes: platformConfig.stateWarningBytes,
    saveLatencyWarningMs: platformConfig.saveLatencyWarningMs,
    ...extras,
  }
}
