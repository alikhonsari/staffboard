import { daysUntil, qualificationKey, QUALIFIED_STATUSES } from './trainingCore.js'

export const SIMPLE_RESULT_META = {
  'Not Trained': { icon: '✕', className: 'training-result-not-trained' },
  Trained: { icon: '✓', className: 'training-result-trained' },
  'In Training': { icon: '●', className: 'training-result-in-training' },
  Trainer: { icon: '★', className: 'training-result-trainer' },
  Expired: { icon: '!', className: 'training-result-expired' },
  Suspended: { icon: '×', className: 'training-result-suspended' },
  Inactive: { icon: '–', className: 'training-result-inactive' },
}

export const SKILL_RESULT_FILTERS = [
  ['all', 'All'],
  ['Trained', 'Trained'],
  ['Not Trained', 'Not Trained'],
  ['In Training', 'In Training'],
  ['Trainer', 'Trainer'],
  ['Expired', 'Expired'],
]

const SIMPLE_STATUS_MAP = {
  'Not Started': 'Not Trained',
  'In Training': 'In Training',
  Qualified: 'Trained',
  'Cross-Trained': 'Trained',
  Trainer: 'Trainer',
  Expired: 'Expired',
  Suspended: 'Suspended',
  Inactive: 'Inactive',
}

const clean = (value) => String(value ?? '').trim()
const asDate = (value) => value instanceof Date ? value : new Date(value)

export function simplifiedTrainingResult(qualification, today = new Date()) {
  if (!qualification) return 'Not Trained'
  const status = clean(qualification.status) || 'Not Started'
  if (QUALIFIED_STATUSES.has(status) && qualification.expirationDate) {
    const remaining = daysUntil(qualification.expirationDate, asDate(today))
    if (remaining != null && remaining < 0) return 'Expired'
  }
  return SIMPLE_STATUS_MAP[status] || 'Not Trained'
}

export function buildQuickQualificationDraft(existing, builderId, trainingId, status, today = new Date()) {
  const date = asDate(today)
  const completionDate = ['Qualified', 'Cross-Trained', 'Trainer'].includes(status)
    ? clean(existing?.completionDate) || date.toISOString().slice(0, 10)
    : clean(existing?.completionDate)
  return {
    builderId,
    trainingId,
    status,
    completionDate,
    expirationDate: clean(existing?.expirationDate),
    trainerBuilderId: clean(existing?.trainerBuilderId),
    trainerName: clean(existing?.trainerName),
    notes: clean(existing?.notes),
    certificateNumber: clean(existing?.certificateNumber),
    certificateFileUrl: clean(existing?.certificateFileUrl),
    assessmentScore: existing?.assessmentScore ?? '',
    reason: '',
  }
}

export function requiresUntrainConfirmation(existing) {
  return Boolean(existing && ['Qualified', 'Cross-Trained', 'Trainer'].includes(existing.status))
}

export function buildBuilderSkills(builder, snapshot = {}, options = {}) {
  const today = options.today || new Date()
  const includeInactive = Boolean(options.includeInactive)
  const qualificationLookup = options.qualificationsByKey || new Map(
    (snapshot.qualifications || []).map((item) => [qualificationKey(item.builderId, item.trainingId), item]),
  )
  const catalog = (snapshot.catalog || [])
    .filter((path) => includeInactive || path.active)
    .slice()
    .sort((left, right) => clean(left.category).localeCompare(clean(right.category)) || clean(left.name).localeCompare(clean(right.name)))

  const rows = catalog.map((path) => {
    const qualification = qualificationLookup.get(qualificationKey(builder.id, path.id)) || null
    const detailedStatus = qualification?.status || 'Not Started'
    const result = simplifiedTrainingResult(qualification, today)
    return {
      builderId: builder.id,
      trainingId: path.id,
      trainingName: path.name,
      category: path.category || 'Other',
      catalogActive: Boolean(path.active),
      result,
      detailedStatus,
      completionDate: qualification?.completionDate || '',
      expirationDate: qualification?.expirationDate || '',
      trainerBuilderId: qualification?.trainerBuilderId || '',
      trainerName: qualification?.trainerName || '',
      notes: qualification?.notes || '',
      certificateNumber: qualification?.certificateNumber || '',
      certificateFileUrl: qualification?.certificateFileUrl || '',
      assessmentScore: qualification?.assessmentScore ?? '',
      updatedAt: qualification?.updatedAt || '',
      qualification,
    }
  })

  const counts = {
    all: rows.length,
    Trained: rows.filter((row) => row.result === 'Trained').length,
    'Not Trained': rows.filter((row) => row.result === 'Not Trained').length,
    'In Training': rows.filter((row) => row.result === 'In Training').length,
    Trainer: rows.filter((row) => row.result === 'Trainer').length,
    Expired: rows.filter((row) => row.result === 'Expired').length,
    Suspended: rows.filter((row) => row.result === 'Suspended').length,
    Inactive: rows.filter((row) => row.result === 'Inactive').length,
  }

  return {
    builder,
    rows,
    counts,
    trainedNames: rows.filter((row) => row.result === 'Trained').map((row) => row.trainingName),
    notTrainedNames: rows.filter((row) => row.result === 'Not Trained').map((row) => row.trainingName),
    inTrainingNames: rows.filter((row) => row.result === 'In Training').map((row) => row.trainingName),
    trainerNames: rows.filter((row) => row.result === 'Trainer').map((row) => row.trainingName),
    expiredNames: rows.filter((row) => row.result === 'Expired').map((row) => row.trainingName),
    mostRecentlyUpdated: rows.reduce((latest, row) => row.updatedAt > latest ? row.updatedAt : latest, ''),
  }
}

export function filterBuilderSkillRows(rows = [], resultFilter = 'all', query = '') {
  const search = clean(query).toLowerCase()
  return rows.filter((row) => {
    if (resultFilter !== 'all' && row.result !== resultFilter) return false
    if (!search) return true
    return `${row.trainingName} ${row.category} ${row.result} ${row.detailedStatus} ${row.trainerName} ${row.notes}`.toLowerCase().includes(search)
  })
}

export function groupBuilderSkillRows(rows = []) {
  const groups = new Map()
  rows.forEach((row) => {
    const category = clean(row.category) || 'Other'
    if (!groups.has(category)) groups.set(category, [])
    groups.get(category).push(row)
  })
  return [...groups.entries()].map(([category, items]) => ({ category, items }))
}

export function buildAllBuilderSkillSummaries(snapshot = {}, options = {}) {
  const includeArchived = Boolean(options.includeArchived)
  const qualificationLookup = options.qualificationsByKey || new Map(
    (snapshot.qualifications || []).map((item) => [qualificationKey(item.builderId, item.trainingId), item]),
  )
  return (snapshot.builders || [])
    .filter((builder) => includeArchived || !builder.archived)
    .map((builder) => buildBuilderSkills(builder, snapshot, { ...options, qualificationsByKey: qualificationLookup }))
}

export function filterAndSortBuilderSummaries(summaries = [], controls = {}) {
  const query = clean(controls.search).toLowerCase()
  const shift = clean(controls.shift)
  const department = clean(controls.department)
  const sort = clean(controls.sort) || 'name'
  const filtered = summaries.filter((summary) => {
    const { builder, rows } = summary
    if (shift && builder.currentShift !== shift) return false
    if (department && builder.department !== department) return false
    if (!query) return true
    const skills = rows.map((row) => `${row.trainingName} ${row.result} ${row.detailedStatus}`).join(' ')
    return `${builder.name} ${builder.badgeId || ''} ${builder.currentShift || ''} ${builder.department || ''} ${skills}`.toLowerCase().includes(query)
  })
  return filtered.sort((left, right) => {
    if (sort === 'trained-desc') return right.counts.Trained - left.counts.Trained || left.builder.name.localeCompare(right.builder.name)
    if (sort === 'missing-desc') return right.counts['Not Trained'] - left.counts['Not Trained'] || left.builder.name.localeCompare(right.builder.name)
    if (sort === 'shift') return clean(left.builder.currentShift).localeCompare(clean(right.builder.currentShift)) || left.builder.name.localeCompare(right.builder.name)
    if (sort === 'updated-desc') return clean(right.mostRecentlyUpdated).localeCompare(clean(left.mostRecentlyUpdated)) || left.builder.name.localeCompare(right.builder.name)
    return left.builder.name.localeCompare(right.builder.name)
  })
}

export function buildBuilderTrainingExportRows(snapshot = {}, options = {}) {
  return buildAllBuilderSkillSummaries(snapshot, options).flatMap((summary) => summary.rows.map((row) => ({
    Builder: summary.builder.name,
    'Builder ID': summary.builder.id,
    'Badge ID': summary.builder.badgeId || '',
    Shift: summary.builder.currentShift || '',
    Department: summary.builder.department || '',
    'Training Area': row.trainingName,
    Category: row.category,
    'Simplified Result': row.result,
    'Detailed Status': row.detailedStatus,
    'Completion Date': row.completionDate,
    'Expiration Date': row.expirationDate,
    Trainer: row.trainerName,
    Notes: row.notes,
  })))
}
