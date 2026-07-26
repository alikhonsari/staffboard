export const TRAINING_STATUSES = [
  'Not Started', 'In Training', 'Qualified', 'Cross-Trained', 'Trainer', 'Expired', 'Suspended', 'Inactive',
]

export const QUALIFIED_STATUSES = new Set(['Qualified', 'Cross-Trained', 'Trainer'])

export const STATUS_META = {
  'Not Started': { icon: '○', className: 'training-status-not-started' },
  'In Training': { icon: '●', className: 'training-status-in-training' },
  Qualified: { icon: '✓', className: 'training-status-qualified' },
  'Cross-Trained': { icon: '◆', className: 'training-status-cross-trained' },
  Trainer: { icon: '★', className: 'training-status-trainer' },
  Expired: { icon: '!', className: 'training-status-expired' },
  Suspended: { icon: '×', className: 'training-status-suspended' },
  Inactive: { icon: '–', className: 'training-status-inactive' },
}

export function qualificationKey(builderId, trainingId) {
  return `${builderId}::${trainingId}`
}

export function qualificationMap(qualifications = []) {
  return new Map(qualifications.map((item) => [qualificationKey(item.builderId, item.trainingId), item]))
}

export function isQualificationCurrent(qualification, today = new Date()) {
  if (!qualification || !QUALIFIED_STATUSES.has(qualification.status)) return false
  if (!qualification.expirationDate) return true
  const end = new Date(`${qualification.expirationDate}T23:59:59`)
  return Number.isFinite(end.getTime()) && end >= today
}

export function daysUntil(dateString, today = new Date()) {
  if (!dateString) return null
  const value = new Date(`${dateString}T00:00:00`)
  if (!Number.isFinite(value.getTime())) return null
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.ceil((value.getTime() - start.getTime()) / 86_400_000)
}

export function filterTrainingBuilders(builders = [], qualifications = [], catalog = [], filters = {}) {
  const query = String(filters.search || '').trim().toLowerCase()
  const status = String(filters.status || '')
  const shift = String(filters.shift || '')
  const trainingId = String(filters.trainingId || '')
  const catalogById = new Map(catalog.map((path) => [path.id, path]))
  const byBuilder = new Map()
  qualifications.forEach((item) => {
    if (!byBuilder.has(item.builderId)) byBuilder.set(item.builderId, [])
    byBuilder.get(item.builderId).push(item)
  })

  return builders.filter((builder) => {
    const rows = byBuilder.get(builder.id) || []
    if (shift && builder.currentShift !== shift) return false
    if (status && !rows.some((row) => row.status === status)) return false
    if (trainingId && !rows.some((row) => row.trainingId === trainingId)) return false
    if (!query) return true
    const trainingText = rows.map((row) => `${catalogById.get(row.trainingId)?.name || ''} ${row.status} ${row.trainerName || ''}`).join(' ')
    return `${builder.name} ${builder.badgeId || ''} ${builder.currentShift || ''} ${builder.department || ''} ${trainingText}`.toLowerCase().includes(query)
  })
}

export function buildTrainingMetrics(snapshot = {}, today = new Date()) {
  const builders = (snapshot.builders || []).filter((builder) => !builder.archived)
  const catalog = (snapshot.catalog || []).filter((path) => path.active)
  const qualifications = snapshot.qualifications || []
  const activeBuilderIds = new Set(builders.map((builder) => builder.id))
  const current = qualifications.filter((item) => activeBuilderIds.has(item.builderId) && isQualificationCurrent(item, today))
  const byBuilder = new Map()
  current.forEach((item) => {
    if (!byBuilder.has(item.builderId)) byBuilder.set(item.builderId, [])
    byBuilder.get(item.builderId).push(item)
  })
  const qualifiedBuilderCount = builders.filter((builder) => (byBuilder.get(builder.id) || []).length > 0).length
  const crossTrainedBuilderCount = builders.filter((builder) => {
    const rows = byBuilder.get(builder.id) || []
    return rows.length >= 2 || rows.some((row) => row.status === 'Cross-Trained')
  }).length

  const coverage = catalog.map((path) => {
    const rows = qualifications.filter((item) => item.trainingId === path.id && activeBuilderIds.has(item.builderId))
    const qualifiedRows = rows.filter((item) => isQualificationCurrent(item, today))
    const trainers = qualifiedRows.filter((item) => item.status === 'Trainer')
    const inTraining = rows.filter((item) => item.status === 'In Training')
    const minimum = Number(path.minimumQualified || 0)
    const risk = qualifiedRows.length === 0 ? 'No Coverage'
      : qualifiedRows.length < minimum ? 'Below Minimum'
        : qualifiedRows.length === minimum ? 'No Backup' : 'Covered'
    const suggestedBuilders = builders
      .filter((builder) => !rows.some((item) => item.builderId === builder.id && item.status !== 'Not Started'))
      .sort((left, right) => (byBuilder.get(left.id)?.length || 0) - (byBuilder.get(right.id)?.length || 0))
      .slice(0, 3)
      .map((builder) => builder.name)
    return {
      trainingId: path.id,
      name: path.name,
      category: path.category,
      qualified: qualifiedRows.length,
      inTraining: inTraining.length,
      trainers: trainers.length,
      minimum,
      coveragePct: builders.length ? Math.round((qualifiedRows.length / builders.length) * 100) : 0,
      risk,
      suggestedBuilders,
    }
  })

  const expiring = qualifications
    .map((item) => ({ ...item, daysRemaining: daysUntil(item.expirationDate, today) }))
    .filter((item) => item.daysRemaining != null && item.daysRemaining >= 0 && item.daysRemaining <= 30)
    .sort((a, b) => a.daysRemaining - b.daysRemaining)

  const expired = qualifications.filter((item) => item.status === 'Expired' || (item.expirationDate && (daysUntil(item.expirationDate, today) ?? 1) < 0))
  const trainerCounts = new Map()
  qualifications.forEach((item) => {
    if (!item.trainerName) return
    trainerCounts.set(item.trainerName, (trainerCounts.get(item.trainerName) || 0) + 1)
  })
  const topTrainers = [...trainerCounts.entries()]
    .map(([name, completions]) => ({ name, completions }))
    .sort((a, b) => b.completions - a.completions || a.name.localeCompare(b.name))
    .slice(0, 8)

  const recentlyCompleted = qualifications
    .filter((item) => item.completionDate && QUALIFIED_STATUSES.has(item.status))
    .sort((a, b) => String(b.completionDate).localeCompare(String(a.completionDate)))
    .slice(0, 10)

  return {
    totalBuilders: builders.length,
    qualifiedBuilderCount,
    qualifiedPct: builders.length ? Math.round((qualifiedBuilderCount / builders.length) * 100) : 0,
    crossTrainedBuilderCount,
    crossTrainedPct: builders.length ? Math.round((crossTrainedBuilderCount / builders.length) * 100) : 0,
    averageQualifications: builders.length ? Number((current.length / builders.length).toFixed(1)) : 0,
    totalCurrentQualifications: current.length,
    coverage,
    missingCoverage: coverage.filter((row) => row.qualified === 0),
    singleCoverage: coverage.filter((row) => row.qualified === 1),
    lowCoverage: coverage.filter((row) => ['No Coverage', 'Below Minimum', 'No Backup'].includes(row.risk)),
    expiring,
    expired,
    topTrainers,
    recentlyCompleted,
  }
}

export function buildBuilderProfile(builder, snapshot = {}, today = new Date()) {
  const catalogById = new Map((snapshot.catalog || []).map((path) => [path.id, path]))
  const qualifications = (snapshot.qualifications || [])
    .filter((item) => item.builderId === builder.id)
    .map((item) => ({ ...item, trainingName: catalogById.get(item.trainingId)?.name || item.trainingId, daysRemaining: daysUntil(item.expirationDate, today) }))
    .sort((a, b) => a.trainingName.localeCompare(b.trainingName))
  return {
    builder,
    qualifications,
    currentQualifications: qualifications.filter((item) => isQualificationCurrent(item, today)),
    expiring: qualifications.filter((item) => item.daysRemaining != null && item.daysRemaining >= 0 && item.daysRemaining <= 30),
    history: (snapshot.history || []).filter((item) => item.builderId === builder.id),
    notes: (snapshot.notes || []).filter((item) => item.builderId === builder.id),
  }
}
