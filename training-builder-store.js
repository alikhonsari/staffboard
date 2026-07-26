import crypto from 'node:crypto'
import { Pool } from 'pg'
import { ensureTrainingSchema } from './training-store.js'

const clean = (value) => String(value ?? '').trim()
const databaseUrl = clean(process.env.DATABASE_URL)
const pgSslMode = clean(process.env.PGSSLMODE || 'require').toLowerCase()
const configured = Boolean(databaseUrl || (
  clean(process.env.PGHOST) && clean(process.env.PGUSER) && clean(process.env.PGPASSWORD) && clean(process.env.PGDATABASE)
))

const pool = configured ? new Pool({
  ...(databaseUrl ? { connectionString: databaseUrl } : {
    host: clean(process.env.PGHOST),
    port: Number(process.env.PGPORT || 5432),
    user: clean(process.env.PGUSER),
    password: process.env.PGPASSWORD || '',
    database: clean(process.env.PGDATABASE),
  }),
  max: Number(process.env.STAFFBOARD_TRAINING_PG_POOL_MAX || 4),
  idleTimeoutMillis: Number(process.env.STAFFBOARD_PG_IDLE_TIMEOUT_MS || 30_000),
  connectionTimeoutMillis: Number(process.env.STAFFBOARD_PG_CONNECT_TIMEOUT_MS || 10_000),
  ssl: pgSslMode === 'disable' ? false : { rejectUnauthorized: false },
  application_name: 'staffboard-training-builders',
}) : null

const nullableText = (value) => clean(value) || null
const nullableDate = (value) => clean(value) || null

function assertConfigured() {
  if (!pool) throw new Error('PostgreSQL is not configured for the Training module.')
}

function normalizeBadgeTag(value) {
  const tag = clean(value).toLowerCase()
  if (tag.includes('green')) return 'Green Badge'
  if (tag.includes('blue') || tag === 'day' || tag === 'night') return 'Blue Badge'
  return ''
}

function normalizeTrainerFlag(value) {
  if (typeof value === 'boolean') return value
  return ['trainer', 'yes', 'true', '1'].includes(clean(value).toLowerCase())
}

async function ensureEnhancements() {
  assertConfigured()
  await ensureTrainingSchema()
  await pool.query(`
    ALTER TABLE training_builders ADD COLUMN IF NOT EXISTS badge_tag TEXT NOT NULL DEFAULT '';
    ALTER TABLE training_builders ADD COLUMN IF NOT EXISTS is_trainer BOOLEAN NOT NULL DEFAULT FALSE;
    CREATE TABLE IF NOT EXISTS training_catalog_order (
      training_id TEXT PRIMARY KEY REFERENCES training_catalog(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
}

function mapBuilder(row) {
  return {
    id: row.builder_id,
    name: row.name,
    badgeId: row.badge_id || '',
    badgeTag: row.badge_tag || '',
    isTrainer: Boolean(row.is_trainer),
    hireDate: row.hire_date || '',
    currentStatus: row.current_status || 'Active',
    currentShift: row.current_shift || '',
    department: row.department || '',
    archived: Boolean(row.archived),
    syncedAt: row.synced_at,
  }
}

function normalizeRosterBuilder(builder = {}) {
  return {
    id: clean(builder.id || builder.builderId),
    name: clean(builder.name),
    badgeId: clean(builder.badgeId || builder.badge || builder.badgeNumber || builder.employeeId),
    badgeTag: normalizeBadgeTag(builder.badgeTag || builder.badgeColor || builder.badge),
    isTrainer: normalizeTrainerFlag(builder.isTrainer ?? builder.trainerTag ?? builder.trainer),
    hireDate: clean(builder.hireDate || builder.startDate),
    currentStatus: builder.isArchived || builder.archived ? 'Archived' : clean(builder.currentStatus || builder.status || 'Active') || 'Active',
    currentShift: clean(builder.currentShift || builder.shift || builder.defaultShift),
    department: clean(builder.department || builder.board || builder.defaultBoardId),
    archived: Boolean(builder.isArchived || builder.archived),
  }
}

async function duplicateBuilder(client, input, excludeId = '') {
  const name = clean(input.name)
  const badgeId = clean(input.badgeId)
  const result = await client.query(`
    SELECT builder_id, name, badge_id
    FROM training_builders
    WHERE builder_id <> $1
      AND (LOWER(name) = LOWER($2) OR ($3 <> '' AND LOWER(COALESCE(badge_id,'')) = LOWER($3)))
    LIMIT 1
  `, [clean(excludeId), name, badgeId])
  return result.rows[0] || null
}

export async function syncTrainingBuildersSafe(builders = []) {
  await ensureEnhancements()
  const normalized = (Array.isArray(builders) ? builders : [])
    .map(normalizeRosterBuilder)
    .filter((builder) => builder.id && builder.name && !builder.archived)

  if (!normalized.length) return { synced: 0, created: 0, updated: 0, skipped: 0, emptyRoster: true }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    let created = 0
    let updated = 0
    let skipped = 0
    for (const builder of normalized) {
      const existing = await client.query('SELECT builder_id FROM training_builders WHERE builder_id = $1', [builder.id])
      const duplicate = await duplicateBuilder(client, builder, builder.id)
      if (duplicate) { skipped += 1; continue }
      const result = await client.query(`
        INSERT INTO training_builders (
          builder_id, name, badge_id, badge_tag, is_trainer, hire_date, current_status, current_shift, department, archived, synced_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,FALSE,NOW())
        ON CONFLICT (builder_id) DO UPDATE SET
          name = EXCLUDED.name,
          badge_id = COALESCE(EXCLUDED.badge_id, training_builders.badge_id),
          badge_tag = COALESCE(NULLIF(EXCLUDED.badge_tag,''), training_builders.badge_tag),
          is_trainer = CASE WHEN EXCLUDED.is_trainer THEN TRUE ELSE training_builders.is_trainer END,
          hire_date = COALESCE(EXCLUDED.hire_date, training_builders.hire_date),
          current_status = EXCLUDED.current_status,
          current_shift = EXCLUDED.current_shift,
          department = EXCLUDED.department,
          archived = FALSE,
          synced_at = NOW()
        RETURNING *
      `, [
        builder.id,
        builder.name,
        nullableText(builder.badgeId),
        builder.badgeTag,
        builder.isTrainer,
        nullableDate(builder.hireDate),
        builder.currentStatus,
        builder.currentShift,
        builder.department,
      ])
      if (result.rowCount) existing.rowCount ? updated += 1 : created += 1
    }
    await client.query('COMMIT')
    return { synced: created + updated, created, updated, skipped, emptyRoster: false }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function createManualTrainingBuilder(input = {}) {
  await ensureEnhancements()
  const builder = normalizeRosterBuilder({ ...input, id: input.id || `manual-${crypto.randomUUID()}` })
  if (!builder.name) throw new Error('Builder name is required.')
  const client = await pool.connect()
  try {
    const duplicate = await duplicateBuilder(client, builder)
    if (duplicate) throw new Error(`A builder with this name or badge ID already exists: ${duplicate.name}`)
    const result = await client.query(`
      INSERT INTO training_builders (
        builder_id, name, badge_id, badge_tag, is_trainer, hire_date, current_status, current_shift, department, archived, synced_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,FALSE,NOW())
      RETURNING *
    `, [builder.id, builder.name, nullableText(builder.badgeId), builder.badgeTag, builder.isTrainer, nullableDate(builder.hireDate), builder.currentStatus, builder.currentShift, builder.department])
    return mapBuilder(result.rows[0])
  } finally {
    client.release()
  }
}

export async function updateManualTrainingBuilder(id, input = {}) {
  await ensureEnhancements()
  const builderId = clean(id)
  if (!builderId) throw new Error('Builder ID is required.')
  const currentResult = await pool.query('SELECT * FROM training_builders WHERE builder_id = $1', [builderId])
  if (!currentResult.rowCount) throw new Error('Training builder not found.')
  const current = mapBuilder(currentResult.rows[0])
  const next = {
    ...current,
    ...input,
    name: clean(input.name ?? current.name),
    badgeId: clean(input.badgeId ?? current.badgeId),
    badgeTag: input.badgeTag == null ? current.badgeTag : normalizeBadgeTag(input.badgeTag),
    isTrainer: input.isTrainer == null ? current.isTrainer : normalizeTrainerFlag(input.isTrainer),
    hireDate: clean(input.hireDate ?? current.hireDate),
    currentStatus: clean(input.currentStatus ?? current.currentStatus) || 'Active',
    currentShift: clean(input.currentShift ?? current.currentShift),
    department: clean(input.department ?? current.department),
    archived: input.archived == null ? current.archived : Boolean(input.archived),
  }
  if (!next.name) throw new Error('Builder name is required.')
  const client = await pool.connect()
  try {
    const duplicate = await duplicateBuilder(client, next, builderId)
    if (duplicate) throw new Error(`A builder with this name or badge ID already exists: ${duplicate.name}`)
    const result = await client.query(`
      UPDATE training_builders SET
        name = $2,
        badge_id = $3,
        badge_tag = $4,
        is_trainer = $5,
        hire_date = $6,
        current_status = $7,
        current_shift = $8,
        department = $9,
        archived = $10,
        synced_at = NOW()
      WHERE builder_id = $1
      RETURNING *
    `, [builderId, next.name, nullableText(next.badgeId), next.badgeTag, next.isTrainer, nullableDate(next.hireDate), next.currentStatus, next.currentShift, next.department, next.archived])
    return mapBuilder(result.rows[0])
  } finally {
    client.release()
  }
}

export async function upsertTrainingMatrixBuilder(input = {}) {
  await ensureEnhancements()
  const name = clean(input.name)
  if (!name) throw new Error('Builder name is required.')
  const badgeTag = normalizeBadgeTag(input.badgeTag)
  const isTrainer = normalizeTrainerFlag(input.isTrainer)
  const client = await pool.connect()
  try {
    const existing = await client.query(`
      SELECT * FROM training_builders
      WHERE LOWER(name) = LOWER($1)
      ORDER BY archived, synced_at DESC
      LIMIT 1
    `, [name])
    if (existing.rowCount) {
      const result = await client.query(`
        UPDATE training_builders SET
          name = $2,
          badge_tag = $3,
          is_trainer = $4,
          current_status = 'Active',
          archived = FALSE,
          synced_at = NOW()
        WHERE builder_id = $1
        RETURNING *
      `, [existing.rows[0].builder_id, name, badgeTag, isTrainer])
      return { builder: mapBuilder(result.rows[0]), created: false, updated: true }
    }
    const id = `matrix-${crypto.createHash('sha256').update(name.toLowerCase()).digest('hex').slice(0, 24)}`
    const result = await client.query(`
      INSERT INTO training_builders (
        builder_id, name, badge_tag, is_trainer, current_status, current_shift, department, archived, synced_at
      ) VALUES ($1,$2,$3,$4,'Active','','',FALSE,NOW())
      ON CONFLICT (builder_id) DO UPDATE SET
        name = EXCLUDED.name,
        badge_tag = EXCLUDED.badge_tag,
        is_trainer = EXCLUDED.is_trainer,
        current_status = 'Active',
        archived = FALSE,
        synced_at = NOW()
      RETURNING *
    `, [id, name, badgeTag, isTrainer])
    return { builder: mapBuilder(result.rows[0]), created: true, updated: false }
  } finally {
    client.release()
  }
}

export async function reorderTrainingCatalog(orderedIds = []) {
  await ensureEnhancements()
  const ids = [...new Set((Array.isArray(orderedIds) ? orderedIds : []).map(clean).filter(Boolean))]
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (let index = 0; index < ids.length; index += 1) {
      await client.query(`
        INSERT INTO training_catalog_order (training_id, sort_order, updated_at)
        VALUES ($1,$2,NOW())
        ON CONFLICT (training_id) DO UPDATE SET sort_order = EXCLUDED.sort_order, updated_at = NOW()
      `, [ids[index], index])
    }
    await client.query('COMMIT')
    return { reordered: ids.length }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function enrichTrainingSnapshot(snapshot = {}) {
  await ensureEnhancements()
  const [orderResult, tagResult] = await Promise.all([
    pool.query('SELECT training_id, sort_order FROM training_catalog_order'),
    pool.query('SELECT builder_id, badge_tag, is_trainer FROM training_builders'),
  ])
  const order = new Map(orderResult.rows.map((row) => [row.training_id, Number(row.sort_order || 0)]))
  const tags = new Map(tagResult.rows.map((row) => [row.builder_id, {
    badgeTag: row.badge_tag || '',
    isTrainer: Boolean(row.is_trainer),
  }]))
  const catalog = [...(snapshot.catalog || [])]
    .map((path, index) => ({ ...path, sortOrder: order.has(path.id) ? order.get(path.id) : 10000 + index }))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
  const builders = (snapshot.builders || []).map((builder) => ({ ...builder, ...(tags.get(builder.id) || { badgeTag: '', isTrainer: false }) }))
  return { ...snapshot, builders, catalog }
}
