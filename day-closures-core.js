import {
  CLOSURE_SCOPES, CLOSURE_REASONS, addAudit, addClosureNotification,
  assertClosureWeeksUnlocked, boardFor, boardIdsForClosure, cancelPendingTransitionsForScope,
  clean, clone, closureDisplayReason, closureSlotForScope, dayRefs, getOperationalClosure,
  hasHistoricalDayData, isObject, makeId, normalizeClosures, operationIdForBoard,
  validateCloseRequest, validateCommonInput, writeClosureRecord,
} from './day-closures-model.js'

export {
  CLOSURE_SCOPES, CLOSURE_REASONS, boardIdsForClosure, closureDisplayReason,
  getOperationalClosure, operationIdForBoard,
} from './day-closures-model.js'
export { assertOperationalDayOpen, isOperationalDayClosed } from './day-closures-model.js'

export function closeOperationalDay(inputState, input, options = {}) {
  validateCloseRequest(input)
  const state = normalizeClosures(clone(inputState))
  assertClosureWeeksUnlocked(state, input)
  const actor = clean(options.actor || input.actor || 'System') || 'System'
  const nowIso = (options.now instanceof Date ? options.now : new Date(options.now || Date.now())).toISOString()
  const operationId = operationIdForBoard(input.boardId)
  const slot = closureSlotForScope(input.scope)
  const dayRecord = state.dayClosures?.[operationId]?.[input.weekStartDate]?.[input.day] || {}
  if (dayRecord.entireDay?.closed && input.scope !== CLOSURE_SCOPES.ENTIRE_DAY) {
    throw new Error('The entire operational day is already closed. Reopen the entire day before changing an individual shift.')
  }
  const existing = dayRecord[slot]
  if (existing?.closed) {
    const same = existing.reason === input.reason && clean(existing.customReason) === clean(input.customReason) && clean(existing.note) === clean(input.note)
    if (same) return { state: inputState, changed: false, events: [], closure: existing, canceledTransitionCount: 0 }
    throw new Error('This day or shift is already closed. Reopen it before applying a different closure.')
  }

  const id = makeId('closure')
  const canceled = cancelPendingTransitionsForScope(state, input, actor, nowIso, id)
  const affectedDays = boardIdsForClosure(input.boardId, input.scope).flatMap((boardId) => dayRefs(boardFor(state, boardId), input.weekStartDate, input.day))
  const closure = {
    id, closed: true, scope: input.scope, reason: input.reason,
    customReason: input.reason === 'Other' ? clean(input.customReason) : '', note: clean(input.note),
    effectiveDate: clean(input.effectiveDate), closedBy: actor, closedAt: nowIso,
    reopenedBy: null, reopenedAt: null, canceledTransitionCount: canceled.length,
    partialData: affectedDays.some(hasHistoricalDayData),
  }
  writeClosureRecord(state, operationId, input.weekStartDate, input.day, slot, closure)
  const actionType = input.scope === CLOSURE_SCOPES.ENTIRE_DAY ? 'DAY_CLOSED' : 'SHIFT_CLOSED'
  const reason = closureDisplayReason(closure)
  const event = {
    kind: 'closure', id, actionType, timestamp: nowIso, actor, operationId,
    boardId: input.boardId, weekStartDate: input.weekStartDate, day: input.day, scope: input.scope,
    reason: closure.reason, customReason: closure.customReason, note: closure.note,
    canceledTransitionCount: canceled.length, previousState: existing || null, newState: closure,
    message: `${input.day} marked closed${reason ? ` — ${reason}` : ''}.`,
  }
  addAudit(state, {
    id, timestamp: nowIso, admin: actor, board: operationId, boardId: input.boardId,
    shift: input.scope, weekStartDate: input.weekStartDate, day: input.day,
    action: actionType, actionType, oldValue: existing ? JSON.stringify(existing) : 'Open',
    newValue: `${reason}${closure.note ? ` — ${closure.note}` : ''}`, closureId: id,
  })
  addClosureNotification(state, event)
  return { state, changed: true, events: [event, ...canceled], closure, canceledTransitionCount: canceled.length }
}

export function reopenOperationalDay(inputState, input, options = {}) {
  validateCommonInput(input)
  const state = normalizeClosures(clone(inputState))
  assertClosureWeeksUnlocked(state, input)
  const actor = clean(options.actor || input.actor || 'System') || 'System'
  const nowIso = (options.now instanceof Date ? options.now : new Date(options.now || Date.now())).toISOString()
  const operationId = operationIdForBoard(input.boardId)
  const slot = closureSlotForScope(input.scope)
  const dayRecord = state.dayClosures?.[operationId]?.[input.weekStartDate]?.[input.day] || {}
  if (dayRecord.entireDay?.closed && input.scope !== CLOSURE_SCOPES.ENTIRE_DAY) throw new Error('Reopen the entire operational day before reopening an individual shift.')
  const existing = dayRecord[slot]
  if (!existing?.closed) return { state: inputState, changed: false, events: [], closure: existing || null }

  const reopened = { ...existing, closed: false, reopenedBy: actor, reopenedAt: nowIso }
  writeClosureRecord(state, operationId, input.weekStartDate, input.day, slot, reopened)
  const actionType = input.scope === CLOSURE_SCOPES.ENTIRE_DAY ? 'DAY_REOPENED' : 'SHIFT_REOPENED'
  const eventId = makeId('reopen')
  const event = {
    kind: 'closure', id: eventId, actionType, timestamp: nowIso, actor, operationId,
    boardId: input.boardId, weekStartDate: input.weekStartDate, day: input.day, scope: input.scope,
    reason: existing.reason, customReason: existing.customReason, note: clean(input.note) || existing.note || '',
    canceledTransitionCount: 0, previousState: existing, newState: reopened,
    message: `${input.day} reopened. Canceled scheduled transitions were not restored.`,
  }
  addAudit(state, {
    id: eventId, timestamp: nowIso, admin: actor, board: operationId, boardId: input.boardId,
    shift: input.scope, weekStartDate: input.weekStartDate, day: input.day,
    action: actionType, actionType, oldValue: `${closureDisplayReason(existing)} — Closed`, newValue: 'Open',
    closureId: existing.id || eventId,
  })
  addClosureNotification(state, event)
  return { state, changed: true, events: [event], closure: reopened }
}

export function listActiveClosures(state) {
  const rows = []
  for (const [operationId, weeks] of Object.entries(state?.dayClosures || {})) {
    for (const [weekStartDate, days] of Object.entries(weeks || {})) {
      for (const [day, record] of Object.entries(days || {})) {
        for (const [slot, scope] of [['entireDay', CLOSURE_SCOPES.ENTIRE_DAY], ['dayShift', CLOSURE_SCOPES.DAY_SHIFT], ['nightShift', CLOSURE_SCOPES.NIGHT_SHIFT]]) {
          if (record?.[slot]?.closed) rows.push({ operationId, weekStartDate, day, scope, closure: record[slot] })
        }
      }
    }
  }
  return rows
}

export function reconcileClosedDaySchedules(inputState, options = {}) {
  const state = normalizeClosures(clone(inputState))
  const actor = clean(options.actor || 'System') || 'System'
  const nowIso = (options.now instanceof Date ? options.now : new Date(options.now || Date.now())).toISOString()
  const events = []
  for (const row of listActiveClosures(state)) {
    const boardId = `${row.operationId}_${row.scope === CLOSURE_SCOPES.NIGHT_SHIFT ? 'night' : 'day'}`
    events.push(...cancelPendingTransitionsForScope(state, { boardId, weekStartDate: row.weekStartDate, day: row.day, scope: row.scope }, actor, nowIso, row.closure.id || makeId('closure-reconcile')))
  }
  return { state, changed: events.length > 0, events }
}

export function preserveServerManagedClosures(existingState, incomingState) {
  const next = clone(incomingState || {})
  next.dayClosures = clone(existingState?.dayClosures || {})
  next.closureRevision = Number(existingState?.closureRevision || 0)
  next.closureNotifications = clone(existingState?.closureNotifications || [])
  const protectedRows = (Array.isArray(existingState?.auditLog) ? existingState.auditLog : []).filter((row) => row?.closureId || ['DAY_CLOSED', 'SHIFT_CLOSED', 'DAY_REOPENED', 'SHIFT_REOPENED', 'SCHEDULE_CANCELED_BY_CLOSURE'].includes(row?.actionType))
  const rows = [...protectedRows, ...(Array.isArray(next.auditLog) ? next.auditLog : [])]
  const unique = new Map()
  for (const row of rows) unique.set(row?.id || `${row?.timestamp}:${row?.actionType || row?.action}:${row?.closureId}:${row?.transitionId}`, row)
  next.auditLog = [...unique.values()].sort((a, b) => String(b?.timestamp || '').localeCompare(String(a?.timestamp || ''))).slice(0, 500)
  return next
}

function boardDay(state, boardId, weekStartDate, day) {
  const board = boardFor(state, boardId)
  if (!board) return undefined
  return board.weeklyBoards?.[weekStartDate]?.[day] || (clean(board.weekStartDate) === weekStartDate ? board.weeklyData?.[day] : undefined)
}

function comparable(day) {
  if (day === undefined) return undefined
  const value = clone(day)
  if (isObject(value)) delete value.updatedAt
  return value
}

export function assertClosedDayDataUnchanged(existingState, incomingState, context = {}) {
  const boardId = clean(context.boardId || incomingState?.currentBoardId)
  const weekStartDate = clean(context.weekStartDate || incomingState?.weekStartDate)
  const day = clean(context.day || incomingState?.selectedDay)
  if (!boardId || !weekStartDate || !day) return

  const operationId = operationIdForBoard(boardId)
  for (const row of listActiveClosures(existingState)) {
    if (row.operationId !== operationId || row.weekStartDate !== weekStartDate || row.day !== day) continue
    if (!boardIdsForClosure(`${row.operationId}_day`, row.scope).includes(boardId)) continue
    const existing = boardDay(existingState, boardId, weekStartDate, day)
    const incoming = boardDay(incomingState, boardId, weekStartDate, day)
    if (incoming !== undefined && JSON.stringify(comparable(existing)) !== JSON.stringify(comparable(incoming))) {
      throw new Error('This operational day is closed. Reopen it before editing staffing, assignments, goals, production, notes, or rack data.')
    }
  }
}

export const closureStatusPayload = (state) => ({
  closureRevision: Number(state?.closureRevision || 0),
  dayClosures: clone(state?.dayClosures || {}),
  notifications: clone((state?.closureNotifications || []).slice(0, 10)),
})
