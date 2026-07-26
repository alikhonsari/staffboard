export const GRID_RESULTS = ['Trained', 'In Training', 'Not Trained']

const QUALIFIED_GRID_RESULTS = new Set(['Trained'])
const DEMOTION_GRID_RESULTS = new Set(['Not Trained'])

export function normalizeGridResult(result) {
  const value = String(result || '').trim()
  if (value === 'In Training') return 'In Training'
  if (['Trained', 'Trainer', 'Qualified', 'Cross-Trained'].includes(value)) return 'Trained'
  return 'Not Trained'
}

export function gridCellKey(builderId, trainingId) {
  return `${String(builderId || '')}::${String(trainingId || '')}`
}

export function parseGridCellKey(key) {
  const text = String(key || '')
  const divider = text.indexOf('::')
  if (divider < 0) return { builderId: text, trainingId: '' }
  return {
    builderId: text.slice(0, divider),
    trainingId: text.slice(divider + 2),
  }
}

export function shouldConfirmGridTransition(previousResult, nextResult) {
  return QUALIFIED_GRID_RESULTS.has(normalizeGridResult(previousResult)) && DEMOTION_GRID_RESULTS.has(normalizeGridResult(nextResult))
}
