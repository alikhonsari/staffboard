import { detectBackupReason } from './recovery-core.js'
import { createStateBackup, ensureCalendarBackups, recordStateVersions } from './recovery-store.js'

export async function prepareDirectStateSave(beforeState, afterState, context = {}) {
  const reason = detectBackupReason(beforeState, afterState)
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
