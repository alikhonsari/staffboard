import crypto from 'node:crypto'
import {
  addTrainingNote,
  bulkUpsertQualifications,
  createTrainingPath,
  listTrainingSnapshot,
  syncTrainingBuilders,
  trainingHealth,
  updateTrainingPath,
  upsertQualification,
} from './training-store.js'

const installedApps = new WeakSet()
const clean = (value) => String(value ?? '').trim()
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

function csvValue(value) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function snapshotToCsv(snapshot) {
  const builders = new Map(snapshot.builders.map((builder) => [builder.id, builder]))
  const catalog = new Map(snapshot.catalog.map((path) => [path.id, path]))
  const headers = [
    'Builder', 'Builder ID', 'Badge ID', 'Shift', 'Department', 'Training Path', 'Category', 'Status',
    'Completion Date', 'Expiration Date', 'Trainer', 'Certificate Number', 'Assessment Score', 'Notes', 'Updated By', 'Updated At',
  ]
  const rows = snapshot.qualifications.map((qualification) => {
    const builder = builders.get(qualification.builderId) || {}
    const path = catalog.get(qualification.trainingId) || {}
    return [
      builder.name, builder.id, builder.badgeId, builder.currentShift, builder.department, path.name, path.category,
      qualification.status, qualification.completionDate, qualification.expirationDate, qualification.trainerName,
      qualification.certificateNumber, qualification.assessmentScore ?? '', qualification.notes,
      qualification.updatedBy, qualification.updatedAt,
    ]
  })
  return [headers, ...rows].map((row) => row.map(csvValue).join(',')).join('\n')
}

export function installTrainingRoutes(app, options = {}) {
  if (installedApps.has(app)) return
  installedApps.add(app)

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
      const snapshot = await listTrainingSnapshot({ historyLimit: req.query.historyLimit })
      return res.json({ ...snapshot, permissions: {
        canView: true,
        canEditQualifications: editorRoles.has(clean(req.user?.role).toLowerCase()),
        canManageCatalog: adminRoles.has(clean(req.user?.role).toLowerCase()),
      } })
    } catch (error) {
      console.error('Training snapshot failed:', error)
      return res.status(503).json({ error: error.message || 'Failed to load Training data.' })
    }
  })

  app.post('/api/training/builders/sync', requireTrainingAuth, requireEditor, async (req, res) => {
    try {
      const result = await syncTrainingBuilders(req.body?.builders || [])
      return res.json(result)
    } catch (error) {
      console.error('Training builder sync failed:', error)
      return res.status(400).json({ error: error.message || 'Failed to sync builders.' })
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
      const snapshot = await listTrainingSnapshot({ historyLimit: 1 })
      const csv = snapshotToCsv(snapshot)
      res.setHeader('content-type', 'text/csv; charset=utf-8')
      res.setHeader('content-disposition', `attachment; filename="staffboard-training-${new Date().toISOString().slice(0, 10)}.csv"`)
      return res.send(csv)
    } catch (error) {
      return res.status(503).json({ error: error.message || 'Failed to export Training data.' })
    }
  })
}
