import express from 'express'
import crypto from 'crypto'
import path from 'path'
import zlib from 'zlib'
import { getJsonDocument, putJsonDocument } from './postgres-json-store.js'

const clean = (value) => String(value || '').trim()
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''))
  const b = Buffer.from(String(right || ''))
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b)
}

export function decodeRestorePayload(buffer, headers = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Restore upload is empty.')
  const encoding = clean(headers['content-encoding']).toLowerCase()
  const type = clean(headers['content-type']).toLowerCase()
  const compressed = encoding === 'gzip' || type.includes('application/gzip') || type.includes('application/x-gzip')
  const decoded = compressed ? zlib.gunzipSync(buffer) : buffer
  return JSON.parse(decoded.toString('utf8'))
}

export function validateRestorePayload(kind, payload) {
  if (!isPlainObject(payload)) throw new Error('Restore payload must be a JSON object.')
  if (kind === 'state') {
    if (!isPlainObject(payload.state)) throw new Error('State backup must contain a state object.')
    return { count: Object.keys(payload.state).length }
  }
  if (kind === 'history') {
    if (!Array.isArray(payload.events)) throw new Error('History backup must contain an events array.')
    return { count: payload.events.length }
  }
  if (kind === 'versions') {
    if (!Array.isArray(payload.versions)) throw new Error('Version-history backup must contain a versions array.')
    return { count: payload.versions.length }
  }
  throw new Error('Restore kind must be state, history, or versions.')
}

function backupKeyFor(targetKey, timestamp) {
  const directory = targetKey.includes('/') ? targetKey.slice(0, targetKey.lastIndexOf('/') + 1) : ''
  const filename = path.posix.basename(targetKey)
  return `${directory}restore-backups/${timestamp}/${filename}`
}

export function installPostgresRestoreRoutes(app, options = {}) {
  const requireAuth = options.requireAuth
  const keys = options.keys || {}
  const restoreToken = clean(process.env.STAFFBOARD_RESTORE_TOKEN)
  const limitMb = Math.max(1, Math.min(100, Number(process.env.STAFFBOARD_RESTORE_UPLOAD_LIMIT_MB || 25)))
  const rawUpload = express.raw({
    type: ['application/json', 'application/gzip', 'application/x-gzip', 'application/octet-stream'],
    limit: `${limitMb}mb`,
  })

  app.post('/api/admin/restore/:kind', requireAuth, rawUpload, async (req, res) => {
    if (!restoreToken) return res.status(404).json({ error: 'Restore endpoint is disabled.' })
    if (!safeEqual(req.headers['x-staffboard-restore-token'], restoreToken)) {
      return res.status(403).json({ error: 'Invalid restore token.' })
    }

    const kind = clean(req.params.kind).toLowerCase()
    const targetKey = keys[kind]
    if (!targetKey) return res.status(400).json({ error: 'Unknown restore kind.' })

    try {
      const payload = decodeRestorePayload(req.body, req.headers)
      const summary = validateRestorePayload(kind, payload)
      const previous = await getJsonDocument(targetKey, null)
      const restoredAt = new Date().toISOString()
      let backupKey = ''
      if (previous !== null) {
        backupKey = backupKeyFor(targetKey, restoredAt.replace(/[:.]/g, '-'))
        await putJsonDocument(backupKey, previous)
      }
      await putJsonDocument(targetKey, payload)
      console.log(JSON.stringify({
        timestamp: restoredAt,
        level: 'warn',
        event: 'postgres_restore_complete',
        kind,
        targetKey,
        backupKey,
        count: summary.count,
        actor: req.user?.username || 'unknown',
      }))
      res.json({ ok: true, kind, targetKey, backupKey, count: summary.count, restoredAt })
    } catch (error) {
      console.error('PostgreSQL restore failed:', error)
      res.status(400).json({ error: error.message || 'Restore failed.' })
    }
  })
}
