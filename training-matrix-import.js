import {
  bulkUpsertQualifications,
  createTrainingPath,
  listTrainingSnapshot,
  updateTrainingPath,
} from './training-store.js'
import {
  enrichTrainingSnapshot,
  upsertTrainingMatrixBuilder,
} from './training-builder-store.js'

const clean = (value) => String(value ?? '').trim()
const normalized = (value) => clean(value).toLowerCase().replace(/\s+/g, ' ')
const META_HEADERS = new Set([
  'builder', 'name', 'badge tag', 'badge', 'badge id', 'trainer tag', 'trainer',
  'shift', 'department', 'status', 'archived',
])

function csvValue(value) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function parseCsvRows(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  const source = String(text || '').replace(/^\uFEFF/, '')
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (char === '"') {
      if (quoted && source[index + 1] === '"') { field += '"'; index += 1 } else quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(field); field = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[index + 1] === '\n') index += 1
      row.push(field); field = ''
      if (row.some((value) => clean(value))) rows.push(row)
      row = []
    } else field += char
  }
  row.push(field)
  if (row.some((value) => clean(value))) rows.push(row)
  return rows
}

export function normalizeBadgeTag(value) {
  const tag = normalized(value)
  if (!tag) return ''
  if (tag.includes('green')) return 'Green Badge'
  if (tag.includes('blue') || tag === 'day' || tag === 'night') return 'Blue Badge'
  throw new Error(`Unsupported badge tag: ${clean(value)}. Use Blue Badge or Green Badge.`)
}

export function normalizeTrainerTag(value) {
  const tag = normalized(value)
  if (!tag || ['not trainer', 'no', 'false', '0'].includes(tag)) return false
  if (['trainer', 'yes', 'true', '1'].includes(tag)) return true
  throw new Error(`Unsupported trainer tag: ${clean(value)}. Use Trainer or Not Trainer.`)
}

export function normalizeMatrixStatus(value) {
  const status = normalized(value)
  if (!status || ['not trained', 'not started', 'untrained'].includes(status)) return 'Not Trained'
  if (['trained', 'qualified', 'cross-trained', 'cross trained', 'trainer'].includes(status)) return 'Trained'
  if (['in training', 'training'].includes(status)) return 'In Training'
  throw new Error(`Unsupported Training matrix status: ${clean(value)}. Use Trained, In Training, or Not Trained.`)
}

export function matrixStatusToDetailed(status) {
  const simple = normalizeMatrixStatus(status)
  if (simple === 'Trained') return 'Qualified'
  if (simple === 'In Training') return 'In Training'
  return 'Not Started'
}

export function parseTrainingMatrixCsv(text) {
  const rows = parseCsvRows(text)
  if (rows.length < 2) throw new Error('The Training matrix CSV must contain a header and at least one builder row.')
  const headers = rows[0].map(clean)
  const headerKeys = headers.map(normalized)
  const builderIndex = headerKeys.findIndex((value) => value === 'builder' || value === 'name')
  if (builderIndex < 0) throw new Error('The first Training matrix column must be Builder.')
  const badgeIndex = headerKeys.findIndex((value) => value === 'badge tag' || value === 'badge')
  const trainerIndex = headerKeys.findIndex((value) => value === 'trainer tag' || value === 'trainer')
  const pathColumns = headers
    .map((name, index) => ({ name: clean(name), key: headerKeys[index], index }))
    .filter((column) => column.name && !META_HEADERS.has(column.key))
  if (!pathColumns.length) throw new Error('The Training matrix must include at least one training-path column.')

  const duplicatePaths = pathColumns.filter((column, index) => pathColumns.findIndex((item) => item.key === column.key) !== index)
  if (duplicatePaths.length) throw new Error(`Duplicate training path column: ${duplicatePaths[0].name}`)

  const builders = []
  const seenNames = new Set()
  rows.slice(1).forEach((values, rowIndex) => {
    const name = clean(values[builderIndex])
    if (!name) return
    const nameKey = normalized(name)
    if (seenNames.has(nameKey)) throw new Error(`Duplicate builder row at CSV row ${rowIndex + 2}: ${name}`)
    seenNames.add(nameKey)
    const cells = pathColumns.map((column) => ({
      pathName: column.name,
      status: normalizeMatrixStatus(values[column.index]),
    }))
    builders.push({
      name,
      badgeTag: badgeIndex < 0 ? '' : normalizeBadgeTag(values[badgeIndex]),
      isTrainer: trainerIndex < 0 ? false : normalizeTrainerTag(values[trainerIndex]),
      cells,
    })
  })
  if (!builders.length) throw new Error('No builder rows were found in the Training matrix.')
  return { builders, paths: pathColumns.map((column) => column.name) }
}

export async function importTrainingMatrixCsv(text, actor = 'unknown') {
  const matrix = parseTrainingMatrixCsv(text)
  let buildersCreated = 0
  let buildersUpdated = 0
  for (const builder of matrix.builders) {
    const result = await upsertTrainingMatrixBuilder(builder)
    if (result.created) buildersCreated += 1
    else buildersUpdated += 1
  }

  let snapshot = await enrichTrainingSnapshot(await listTrainingSnapshot({ historyLimit: 1 }))
  let pathsCreated = 0
  let pathsRestored = 0
  const pathByName = new Map(snapshot.catalog.map((path) => [normalized(path.name), path]))
  for (const pathName of matrix.paths) {
    const key = normalized(pathName)
    const existing = pathByName.get(key)
    if (!existing) {
      const created = await createTrainingPath({ name: pathName, category: 'Operations', minimumQualified: 0 }, actor)
      pathByName.set(key, created)
      pathsCreated += 1
    } else if (!existing.active) {
      const restored = await updateTrainingPath(existing.id, { active: true }, actor)
      pathByName.set(key, restored)
      pathsRestored += 1
    }
  }

  snapshot = await enrichTrainingSnapshot(await listTrainingSnapshot({ historyLimit: 1 }))
  const builderByName = new Map(snapshot.builders.map((builder) => [normalized(builder.name), builder]))
  const activePathByName = new Map(snapshot.catalog.map((path) => [normalized(path.name), path]))
  const existingByKey = new Map(snapshot.qualifications.map((item) => [`${item.builderId}::${item.trainingId}`, item]))
  const items = []
  let implicitNotTrained = 0

  for (const matrixBuilder of matrix.builders) {
    const builder = builderByName.get(normalized(matrixBuilder.name))
    if (!builder) throw new Error(`Training builder was not created: ${matrixBuilder.name}`)
    for (const cell of matrixBuilder.cells) {
      const path = activePathByName.get(normalized(cell.pathName))
      if (!path) throw new Error(`Training path was not created: ${cell.pathName}`)
      const key = `${builder.id}::${path.id}`
      const existing = existingByKey.get(key)
      if (cell.status === 'Not Trained' && !existing) {
        implicitNotTrained += 1
        continue
      }
      items.push({
        builderId: builder.id,
        trainingId: path.id,
        status: matrixStatusToDetailed(cell.status),
        completionDate: cell.status === 'Not Trained' ? '' : existing?.completionDate || '',
        expirationDate: cell.status === 'Not Trained' ? '' : existing?.expirationDate || '',
        trainerBuilderId: existing?.trainerBuilderId || '',
        trainerName: existing?.trainerName || '',
        notes: existing?.notes || '',
        certificateNumber: existing?.certificateNumber || '',
        certificateFileUrl: existing?.certificateFileUrl || '',
        assessmentScore: existing?.assessmentScore ?? '',
        reason: 'Standalone Training matrix CSV import',
      })
    }
  }

  if (items.length) await bulkUpsertQualifications(items, actor)
  return {
    builders: matrix.builders.length,
    buildersCreated,
    buildersUpdated,
    paths: matrix.paths.length,
    pathsCreated,
    pathsRestored,
    qualificationsUpdated: items.length,
    implicitNotTrained,
  }
}

function simpleStatus(qualification) {
  const status = clean(qualification?.status)
  if (status === 'In Training') return 'In Training'
  if (['Qualified', 'Cross-Trained', 'Trainer'].includes(status)) return 'Trained'
  return 'Not Trained'
}

export function trainingSnapshotToMatrixCsv(snapshot = {}) {
  const builders = (snapshot.builders || []).filter((builder) => !builder.archived)
  const paths = (snapshot.catalog || []).filter((path) => path.active)
  const qualifications = new Map((snapshot.qualifications || []).map((item) => [`${item.builderId}::${item.trainingId}`, item]))
  const headers = ['Builder', 'Badge Tag', 'Trainer Tag', ...paths.map((path) => path.name)]
  const rows = builders.map((builder) => [
    builder.name,
    builder.badgeTag || '',
    builder.isTrainer ? 'Trainer' : 'Not Trainer',
    ...paths.map((path) => simpleStatus(qualifications.get(`${builder.id}::${path.id}`))),
  ])
  return [headers, ...rows].map((row) => row.map(csvValue).join(',')).join('\n')
}
