import crypto from 'node:crypto'
import express from 'express'
import {
  addTrainingNote,
  bulkUpsertQualifications,
  createTrainingPath,
  listTrainingSnapshot,
  trainingHealth,
  updateTrainingPath,
  upsertQualification,
} from './training-store.js'
import {
  createManualTrainingBuilder,
  enrichTrainingSnapshot,
  reorderTrainingCatalog,
  syncTrainingBuildersSafe,
  updateManualTrainingBuilder,
} from './training-builder-store.js'
import {
  importTrainingMatrixCsv,
  trainingSnapshotToMatrixCsv,
} from './training-matrix-import.js'

const installedApps = new WeakSet()
const clean = (value) => String(value ?? '').trim()
const TRAINING_JSON_LIMIT = clean(process.env.STAFFBOARD_TRAINING_JSON_LIMIT || '8mb') || '8mb'
const readerRoles = new Set(['admin', 'manager', 'system', 'readonly', 'read-only', 'viewer'])
const editorRoles = new Set(['admin', 'manager', 'system'])
const adminRoles = new Set(['admin', 'system'])

function timingSafeEqual(left, right) {
  const a = Buffer.from(String(left || ''))
  const b = Buffer.from(String(right || ''))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function makeAuth({ authSecret, authToken }) {
  return function requireTrainingAuth(req, res, next) {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : req.headers['x-auth-token'] || ''
    try {
      if (token?.includes('.')) {
        const [body, signature] = token.split('.')
        const expected = crypto.createHmac('sha256', authSecret).update(body).digest('base64url')
        if (timingSafeEqual(signature, expected)) {
          const session = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
          const role = clean(session.role || 'admin').toLowerCase()
          if ((!session.exp || Date.now() <= session.exp) && readerRoles.has(role)) {
            req.user = { ...session, role }
            return next()
          }
        }
      }
    } catch { /* fall through */ }
    if (authToken && timingSafeEqual(token, authToken)) {
      req.user = { username: 'token-admin', role: 'admin' }
      return next()
    }
    return res.status(401).json({ error: 'Unauthorized' })
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    const role = clean(req.user?.role || '').toLowerCase()
    if (roles.has(role)) return next()
    return res.status(403).json({ error: 'You do not have permission to perform this Training action.' })
  }
}

const actor = (req) => clean(req.user?.username || 'unknown')

export function installTrainingRoutes(app, options = {}) {
  if (installedApps.has(app)) return
  installedApps.add(app)

  // Guarded production startup can register Training routes before server.js mounts
  // its global JSON parser. Keep Training request parsing local and ordered before
  // every Training endpoint so matrix imports and all other mutations receive req.body.
  app.use('/api/training', express.json({ limit: TRAINING_JSON_LIMIT }))

  const requireTrainingAuth = makeAuth({
    authSecret: options.authSecret || 'staffboard-dev-secret',
    authToken: options.authToken || '',
  })
  const requireEditor = requireRole(editorRoles)
  const requireAdmin = requireRole(adminRoles)

  app.get('/api/training/health', requireTrainingAuth, async (req, res) => {
    const health = await trainingHealth()
    return res.status(health.ok ? 200 : 503).json(health)
  })

  app.get('/api/training', requireTrainingAuth, async (req, res) => {
    try {
      const baseSnapshot = await listTrainingSnapshot({ historyLimit: req.query.historyLimit })
      const snapshot = await enrichTrainingSnapshot(baseSnapshot)
      return res.json({ ...snapshot, permissions: {
        canView: true,
        canEditQualifications: editorRoles.has(clean(req.user?.role).toLowerCase()),
        canManageCatalog: adminRoles.has(clean(req.user?.role).toLowerCase()),
        canManageBuilders: adminRoles.has(clean(req.user?.role).toLowerCase()),
      } })
    } catch (error) {
      console.error('Training snapshot failed:', error)
      return res.status(503).json({ error: error.message || 'Failed to load Training data.' })
    }
  })

  app.post('/api/training/import-matrix', requireTrainingAuth, requireAdmin, async (req, res) => {
    try {
      const csvText = String(req.body?.csvText || '')
      if (!csvText.trim()) return res.status(400).json({ error: 'A Training matrix CSV is required.' })
      return res.json(await importTrainingMatrixCsv(csvText, actor(req)))
    } catch (error) {
      console.error('Training matrix import failed:', error)
      return res.status(400).json({ error: error.message || 'Failed to import the Training matrix.' })
    }
  })

  app.post('/api/training/builders/sync', requireTrainingAuth, requireEditor, async (req, res) => {
    try {
      const result = await syncTrainingBuildersSafe(req.body?.builders || [])
      return res.json(result)
    } catch (error) {
      console.error('Training builder sync failed:', error)
      return res.status(400).json({ error: error.message || 'Failed to sync builders.' })
    }
  })

  app.post('/api/training/builders', requireTrainingAuth, requireAdmin, async (req, res) => {
    try {
      return res.status(201).json(await createManualTrainingBuilder(req.body || {}))
    } catch (error) {
      const duplicate = String(error.message || '').toLowerCase().includes('already exists')
      return res.status(duplicate ? 409 : 400).json({ error: error.message || 'Failed to add Training builder.' })
    }
  })

  app.patch('/api/training/builders/:id', requireTrainingAuth, requireAdmin, async (req, res) => {
    try {
      return res.json(await updateManualTrainingBuilder(req.params.id, req.body || {}))
    } catch (error) {
      const duplicate = String(error.message || '').toLowerCase().includes('already exists')
      return res.status(duplicate ? 409 : 400).json({ error: error.message || 'Failed to update Training builder.' })
    }
  })

  app.post('/api/training/catalog', requireTrainingAuth, requireAdmin, async (req, res) => {
    try {
      return res.status(201).json(await createTrainingPath(req.body || {}, actor(req)))
    } catch (error) {
      const status = String(error.message || '').toLowerCase().includes('duplicate') ? 409 : 400
      return res.status(status).json({ error: error.message || 'Failed to create training path.' })
    }
  })

  app.patch('/api/training/catalog/:id', requireTrainingAuth, requireAdmin, async (req, res) => {
    try {
      return res.json(await updateTrainingPath(req.params.id, req.body || {}, actor(req)))
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Failed to update training path.' })
    }
  })

  app.post('/api/training/catalog/reorder', requireTrainingAuth, requireAdmin, async (req, res) => {
    try {
      return res.json(await reorderTrainingCatalog(req.body?.orderedIds || []))
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Failed to reorder training paths.' })
    }
  })

  app.delete('/api/training/catalog/:id', requireTrainingAuth, requireAdmin, async (req, res) => {
    try {
      const updated = await updateTrainingPath(req.params.id, { active: false }, actor(req))
      return res.json(updated)
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Failed to archive training path.' })
    }
  })

  app.put('/api/training/qualifications', requireTrainingAuth, requireEditor, async (req, res) => {
    try {
      return res.json(await upsertQualification(req.body || {}, actor(req)))
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Failed to update qualification.' })
    }
  })

  app.post('/api/training/qualifications/bulk', requireTrainingAuth, requireEditor, async (req, res) => {
    try {
      const items = Array.isArray(req.body?.items) ? req.body.items : []
      if (!items.length) return res.status(400).json({ error: 'At least one qualification update is required.' })
      return res.json({ qualifications: await bulkUpsertQualifications(items, actor(req)) })
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Failed to update qualifications.' })
    }
  })

  app.post('/api/training/notes', requireTrainingAuth, requireEditor, async (req, res) => {
    try {
      return res.status(201).json(await addTrainingNote(req.body || {}, actor(req)))
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Failed to add training note.' })
    }
  })

  app.get('/api/training/export.csv', requireTrainingAuth, async (req, res) => {
    try {
      const snapshot = await enrichTrainingSnapshot(await listTrainingSnapshot({ historyLimit: 1 }))
      const csv = trainingSnapshotToMatrixCsv(snapshot)
      res.setHeader('content-type', 'text/csv; charset=utf-8')
      res.setHeader('content-disposition', `attachment; filename="staffboard-training-matrix-${new Date().toISOString().slice(0, 10)}.csv"`)
      return res.send(csv)
    } catch (error) {
      return res.status(503).json({ error: error.message || 'Failed to export Training data.' })
    }
  })
}
