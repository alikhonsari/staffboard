import { WEEKDAYS, detectBackupReason } from './recovery-core.js'
import { createStateBackup, ensureCalendarBackups, recordStateVersions } from './recovery-store.js'

const same = (left, right) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null)

function replacementReason(beforeState, afterState) {
  for (const day of WEEKDAYS) {
    const before = beforeState.weeklyData?.[day] || {}
    const after = afterState.weeklyData?.[day] || {}
    const sections = [
      ['assignments', before.assignments || {}, after.assignments || {}],
      ['goals', before.opsMetrics || {}, after.opsMetrics || {}],
      ['racks', before.rackLists || {}, after.rackLists || {}],
      ['snapshots', before.snapshots || {}, after.snapshots || {}],
      ['notes', { shiftNotes: before.shiftNotes || '', notes: before.notes || '' }, { shiftNotes: after.shiftNotes || '', notes: after.notes || '' }],
    ]
    const changed = sections.filter(([, left, right]) => !same(left, right)).map(([name]) => name)
    if (changed.length >= 3) return `DAY_REPLACEMENT:${day}:${changed.join(',')}`
  }
  return ''
}

export async function prepareDirectStateSave(beforeState, afterState, context = {}) {
  const reason = detectBackupReason(beforeState, afterState) || replacementReason(beforeState, afterState)
  if (!reason) return null
  return createStateBackup(beforeState, {
    kind: 'pre-action',
    reason,
    actor: context.actor || 'System',
    stateRevision: context.stateRevision || beforeState.updatedAt || '',
    boardId: beforeState.currentBoardId,
    shift: beforeState.boardShift,
    week: beforeState.weekStartDate,
    day: beforeState.selectedDay,
  })
}

export async function completeDirectStateSave(beforeState, afterState, context = {}) {
  const records = await recordStateVersions(beforeState, afterState, {
    actor: context.actor || 'System',
    source: context.source || 'state-save',
    stateRevision: context.stateRevision || afterState.updatedAt || '',
    reason: context.reason || '',
  })
  const backups = await ensureCalendarBackups(afterState, {
    actor: context.actor || 'System',
    stateRevision: context.stateRevision || afterState.updatedAt || '',
  })
  return { records, backups }
}

export const __test = { replacementReason }
