import crypto from 'node:crypto'
import { Pool } from 'pg'

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
  application_name: 'staffboard-training',
}) : null

export const TRAINING_STATUSES = [
  'Not Started', 'In Training', 'Qualified', 'Cross-Trained', 'Trainer', 'Expired', 'Suspended', 'Inactive',
]

const DEFAULT_TRAINING_PATHS = [
  'Rack Prep', 'OB1', 'OB2', 'Speed Lite', 'Speed Line 1', 'Speed Line 2', 'Speed Line 3', 'Shipping',
  'Learning', 'Projects', 'Media Destruction', 'EOS Pull Racks', 'Network Rack Recovery', 'Network Rack Prep',
  'FA Lab', 'Bodega', 'Safety', 'Line Lead', 'Forklift', 'Reach Truck', 'Center Rider', 'Clamp', 'TDR',
  'Problem Solve', 'Quality Audit', 'Trainer', 'Inbound', 'Outbound',
]

const slug = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const nullableDate = (value) => clean(value) || null
const nullableText = (value) => clean(value) || null

let schemaPromise = null

function assertConfigured() {
  if (!pool) throw new Error('PostgreSQL is not configured for the Training module.')
}

export async function ensureTrainingSchema() {
  assertConfigured()
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(`
          CREATE TABLE IF NOT EXISTS training_catalog (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            description TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT 'Operations',
            minimum_qualified INTEGER NOT NULL DEFAULT 2 CHECK (minimum_qualified >= 0),
            expiration_days INTEGER CHECK (expiration_days IS NULL OR expiration_days > 0),
            active BOOLEAN NOT NULL DEFAULT TRUE,
            created_by TEXT NOT NULL DEFAULT 'System',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_by TEXT NOT NULL DEFAULT 'System',
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS training_builders (
            builder_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            badge_id TEXT,
            hire_date DATE,
            current_status TEXT NOT NULL DEFAULT 'Active',
            current_shift TEXT NOT NULL DEFAULT '',
            department TEXT NOT NULL DEFAULT '',
            archived BOOLEAN NOT NULL DEFAULT FALSE,
            synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS builder_training (
            builder_id TEXT NOT NULL REFERENCES training_builders(builder_id) ON DELETE CASCADE,
            training_id TEXT NOT NULL REFERENCES training_catalog(id) ON DELETE RESTRICT,
            status TEXT NOT NULL DEFAULT 'Not Started'
              CHECK (status IN ('Not Started','In Training','Qualified','Cross-Trained','Trainer','Expired','Suspended','Inactive')),
            completion_date DATE,
            expiration_date DATE,
            trainer_builder_id TEXT REFERENCES training_builders(builder_id) ON DELETE SET NULL,
            trainer_name TEXT,
            notes TEXT NOT NULL DEFAULT '',
            certificate_number TEXT,
            certificate_file_url TEXT,
            assessment_score NUMERIC(6,2),
            updated_by TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (builder_id, training_id)
          );

          CREATE TABLE IF NOT EXISTS training_history (
            id UUID PRIMARY KEY,
            builder_id TEXT NOT NULL REFERENCES training_builders(builder_id) ON DELETE CASCADE,
            training_id TEXT REFERENCES training_catalog(id) ON DELETE SET NULL,
            action TEXT NOT NULL,
            old_status TEXT,
            new_status TEXT,
            old_completion_date DATE,
            new_completion_date DATE,
            old_expiration_date DATE,
            new_expiration_date DATE,
            old_trainer_name TEXT,
            new_trainer_name TEXT,
            reason TEXT NOT NULL DEFAULT '',
            changed_by TEXT NOT NULL,
            changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS training_notes (
            id UUID PRIMARY KEY,
            builder_id TEXT NOT NULL REFERENCES training_builders(builder_id) ON DELETE CASCADE,
            note TEXT NOT NULL,
            created_by TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS training_catalog_active_name_idx ON training_catalog (active, name);
          CREATE INDEX IF NOT EXISTS training_builders_name_idx ON training_builders (name);
          CREATE INDEX IF NOT EXISTS builder_training_training_status_idx ON builder_training (training_id, status);
          CREATE INDEX IF NOT EXISTS builder_training_expiration_idx ON builder_training (expiration_date) WHERE expiration_date IS NOT NULL;
          CREATE INDEX IF NOT EXISTS training_history_builder_changed_idx ON training_history (builder_id, changed_at DESC);
          CREATE INDEX IF NOT EXISTS training_notes_builder_created_idx ON training_notes (builder_id, created_at DESC);
        `)

        for (const name of DEFAULT_TRAINING_PATHS) {
          await client.query(`
            INSERT INTO training_catalog (id, name, category, created_by, updated_by)
            VALUES ($1, $2, $3, 'System', 'System')
            ON CONFLICT (name) DO NOTHING
          `, [slug(name), name, ['Safety', 'Line Lead', 'Trainer', 'Quality Audit'].includes(name) ? 'Leadership & Quality' : 'Operations'])
        }
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        schemaPromise = null
        throw error
      } finally {
        client.release()
      }
    })()
  }
  await schemaPromise
}

function mapCatalog(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    minimumQualified: Number(row.minimum_qualified || 0),
    expirationDays: row.expiration_days == null ? null : Number(row.expiration_days),
    active: Boolean(row.active),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  }
}

function mapBuilder(row) {
  return {
    id: row.builder_id,
    name: row.name,
    badgeId: row.badge_id || '',
    hireDate: row.hire_date || '',
    currentStatus: row.current_status,
    currentShift: row.current_shift,
    department: row.department,
    archived: Boolean(row.archived),
    syncedAt: row.synced_at,
  }
}

function mapQualification(row) {
  return {
    builderId: row.builder_id,
    trainingId: row.training_id,
    status: row.status,
    completionDate: row.completion_date || '',
    expirationDate: row.expiration_date || '',
    trainerBuilderId: row.trainer_builder_id || '',
    trainerName: row.trainer_name || '',
    notes: row.notes || '',
    certificateNumber: row.certificate_number || '',
    certificateFileUrl: row.certificate_file_url || '',
    assessmentScore: row.assessment_score == null ? null : Number(row.assessment_score),
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listTrainingSnapshot({ historyLimit = 250 } = {}) {
  await ensureTrainingSchema()
  const [catalog, builders, qualifications, history, notes] = await Promise.all([
    pool.query('SELECT * FROM training_catalog ORDER BY active DESC, category, name'),
    pool.query('SELECT * FROM training_builders ORDER BY archived, name'),
    pool.query('SELECT * FROM builder_training ORDER BY builder_id, training_id'),
    pool.query(`SELECT h.*, c.name AS training_name, b.name AS builder_name
      FROM training_history h
      JOIN training_builders b ON b.builder_id = h.builder_id
      LEFT JOIN training_catalog c ON c.id = h.training_id
      ORDER BY h.changed_at DESC LIMIT $1`, [Math.max(1, Math.min(Number(historyLimit || 250), 1000))]),
    pool.query(`SELECT n.*, b.name AS builder_name FROM training_notes n
      JOIN training_builders b ON b.builder_id = n.builder_id
      ORDER BY n.created_at DESC LIMIT 500`),
  ])
  return {
    catalog: catalog.rows.map(mapCatalog),
    builders: builders.rows.map(mapBuilder),
    qualifications: qualifications.rows.map(mapQualification),
    history: history.rows.map((row) => ({
      id: row.id,
      builderId: row.builder_id,
      builderName: row.builder_name,
      trainingId: row.training_id || '',
      trainingName: row.training_name || '',
      action: row.action,
      oldStatus: row.old_status || '',
      newStatus: row.new_status || '',
      oldCompletionDate: row.old_completion_date || '',
      newCompletionDate: row.new_completion_date || '',
      oldExpirationDate: row.old_expiration_date || '',
      newExpirationDate: row.new_expiration_date || '',
      oldTrainerName: row.old_trainer_name || '',
      newTrainerName: row.new_trainer_name || '',
      reason: row.reason || '',
      changedBy: row.changed_by,
      changedAt: row.changed_at,
    })),
    notes: notes.rows.map((row) => ({
      id: row.id,
      builderId: row.builder_id,
      builderName: row.builder_name,
      note: row.note,
      createdBy: row.created_by,
      createdAt: row.created_at,
    })),
  }
}

export async function syncTrainingBuilders(builders = []) {
  await ensureTrainingSchema()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const seen = []
    for (const builder of builders) {
      const builderId = clean(builder.id || builder.builderId)
      const name = clean(builder.name)
      if (!builderId || !name) continue
      seen.push(builderId)
      await client.query(`
        INSERT INTO training_builders (
          builder_id, name, badge_id, hire_date, current_status, current_shift, department, archived, synced_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,FALSE,NOW())
        ON CONFLICT (builder_id) DO UPDATE SET
          name = EXCLUDED.name,
          badge_id = COALESCE(EXCLUDED.badge_id, training_builders.badge_id),
          hire_date = COALESCE(EXCLUDED.hire_date, training_builders.hire_date),
          current_status = EXCLUDED.current_status,
          current_shift = EXCLUDED.current_shift,
          department = EXCLUDED.department,
          archived = FALSE,
          synced_at = NOW()
      `, [
        builderId,
        name,
        nullableText(builder.badgeId || builder.badge || builder.badgeNumber),
        nullableDate(builder.hireDate),
        clean(builder.currentStatus || builder.status || 'Active') || 'Active',
        clean(builder.currentShift || builder.shift || ''),
        clean(builder.department || builder.board || ''),
      ])
    }
    if (seen.length) {
      await client.query('UPDATE training_builders SET archived = TRUE WHERE NOT (builder_id = ANY($1::text[]))', [seen])
    }
    await client.query('COMMIT')
    return { synced: seen.length }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function createTrainingPath(input, actor) {
  await ensureTrainingSchema()
  const name = clean(input.name)
  if (!name) throw new Error('Training path name is required.')
  const baseId = slug(name) || crypto.randomUUID()
  const id = clean(input.id) || baseId
  const result = await pool.query(`
    INSERT INTO training_catalog (
      id, name, description, category, minimum_qualified, expiration_days, active, created_by, updated_by
    ) VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7,$7)
    RETURNING *
  `, [
    id,
    name,
    clean(input.description),
    clean(input.category || 'Operations') || 'Operations',
    Math.max(0, Number(input.minimumQualified ?? 2)),
    input.expirationDays ? Math.max(1, Number(input.expirationDays)) : null,
    clean(actor || 'unknown'),
  ])
  return mapCatalog(result.rows[0])
}

export async function updateTrainingPath(id, input, actor) {
  await ensureTrainingSchema()
  const result = await pool.query(`
    UPDATE training_catalog SET
      name = COALESCE(NULLIF($2,''), name),
      description = COALESCE($3, description),
      category = COALESCE(NULLIF($4,''), category),
      minimum_qualified = COALESCE($5, minimum_qualified),
      expiration_days = $6,
      active = COALESCE($7, active),
      updated_by = $8,
      updated_at = NOW()
    WHERE id = $1 RETURNING *
  `, [
    clean(id),
    clean(input.name),
    input.description == null ? null : clean(input.description),
    clean(input.category),
    input.minimumQualified == null ? null : Math.max(0, Number(input.minimumQualified)),
    input.expirationDays ? Math.max(1, Number(input.expirationDays)) : null,
    input.active == null ? null : Boolean(input.active),
    clean(actor || 'unknown'),
  ])
  if (!result.rowCount) throw new Error('Training path not found.')
  return mapCatalog(result.rows[0])
}

async function upsertQualificationWithClient(client, input, actor) {
  const builderId = clean(input.builderId)
  const trainingId = clean(input.trainingId)
  const status = clean(input.status || 'Not Started')
  if (!builderId || !trainingId) throw new Error('Builder and training path are required.')
  if (!TRAINING_STATUSES.includes(status)) throw new Error(`Unsupported training status: ${status}`)

  const previousResult = await client.query(
    'SELECT * FROM builder_training WHERE builder_id = $1 AND training_id = $2 FOR UPDATE',
    [builderId, trainingId],
  )
  const previous = previousResult.rows[0] || null
  const result = await client.query(`
    INSERT INTO builder_training (
      builder_id, training_id, status, completion_date, expiration_date, trainer_builder_id, trainer_name,
      notes, certificate_number, certificate_file_url, assessment_score, updated_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (builder_id, training_id) DO UPDATE SET
      status = EXCLUDED.status,
      completion_date = EXCLUDED.completion_date,
      expiration_date = EXCLUDED.expiration_date,
      trainer_builder_id = EXCLUDED.trainer_builder_id,
      trainer_name = EXCLUDED.trainer_name,
      notes = EXCLUDED.notes,
      certificate_number = EXCLUDED.certificate_number,
      certificate_file_url = EXCLUDED.certificate_file_url,
      assessment_score = EXCLUDED.assessment_score,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
    RETURNING *
  `, [
    builderId,
    trainingId,
    status,
    nullableDate(input.completionDate),
    nullableDate(input.expirationDate),
    nullableText(input.trainerBuilderId),
    nullableText(input.trainerName),
    clean(input.notes),
    nullableText(input.certificateNumber),
    nullableText(input.certificateFileUrl),
    input.assessmentScore === '' || input.assessmentScore == null ? null : Number(input.assessmentScore),
    clean(actor || 'unknown'),
  ])
  const next = result.rows[0]
  await client.query(`
    INSERT INTO training_history (
      id, builder_id, training_id, action,
      old_status, new_status, old_completion_date, new_completion_date,
      old_expiration_date, new_expiration_date, old_trainer_name, new_trainer_name,
      reason, changed_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
  `, [
    crypto.randomUUID(), builderId, trainingId, previous ? 'Qualification updated' : 'Qualification created',
    previous?.status || null, next.status,
    previous?.completion_date || null, next.completion_date || null,
    previous?.expiration_date || null, next.expiration_date || null,
    previous?.trainer_name || null, next.trainer_name || null,
    clean(input.reason), clean(actor || 'unknown'),
  ])
  return mapQualification(next)
}

export async function upsertQualification(input, actor) {
  await ensureTrainingSchema()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const saved = await upsertQualificationWithClient(client, input, actor)
    await client.query('COMMIT')
    return saved
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function bulkUpsertQualifications(items, actor) {
  await ensureTrainingSchema()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const saved = []
    for (const item of Array.isArray(items) ? items : []) {
      saved.push(await upsertQualificationWithClient(client, item, actor))
    }
    await client.query('COMMIT')
    return saved
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function addTrainingNote({ builderId, note }, actor) {
  await ensureTrainingSchema()
  const id = crypto.randomUUID()
  const text = clean(note)
  if (!clean(builderId) || !text) throw new Error('Builder and note are required.')
  const result = await pool.query(`
    INSERT INTO training_notes (id, builder_id, note, created_by)
    VALUES ($1,$2,$3,$4)
    RETURNING *
  `, [id, clean(builderId), text, clean(actor || 'unknown')])
  return {
    id: result.rows[0].id,
    builderId: result.rows[0].builder_id,
    note: result.rows[0].note,
    createdBy: result.rows[0].created_by,
    createdAt: result.rows[0].created_at,
  }
}

export async function trainingHealth() {
  const started = Date.now()
  try {
    await ensureTrainingSchema()
    await pool.query('SELECT 1')
    return { ok: true, configured: true, latencyMs: Date.now() - started }
  } catch (error) {
    return { ok: false, configured, latencyMs: Date.now() - started, error: error.message }
  }
}

export async function closeTrainingStore() {
  if (pool) await pool.end()
}
