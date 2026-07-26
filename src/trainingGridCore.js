export const GRID_RESULTS = ['Trained', 'Not Trained', 'In Training', 'Trainer', 'Expired', 'Suspended']

const QUALIFIED_GRID_RESULTS = new Set(['Trained', 'Trainer'])
const DEMOTION_GRID_RESULTS = new Set(['Not Trained', 'Expired', 'Suspended'])

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
  return QUALIFIED_GRID_RESULTS.has(String(previousResult || '')) && DEMOTION_GRID_RESULTS.has(String(nextResult || ''))
}
