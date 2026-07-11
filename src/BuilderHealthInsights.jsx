import React, { useMemo } from 'react'

const lower = (value) => String(value || '').trim().toLowerCase()

function expirationState(record) {
  if (!record?.expirationDate) return 'none'
  const end = new Date(`${record.expirationDate}T23:59:59`)
  if (Number.isNaN(end.getTime())) return 'none'
  const days = Math.ceil((end - new Date()) / 86400000)
  if (days < 0) return 'expired'
  if (days <= 30) return 'expiring'
  return 'valid'
}

export default function BuilderHealthInsights({ state, dayState, mode = 'manager' }) {
  const metrics = useMemo(() => {
    const profiles = Array.isArray(state?.builderPool) ? state.builderPool : []
    const active = profiles.filter((profile) => !profile.isArchived)
    const archived = profiles.filter((profile) => profile.isArchived)
    const assignments = dayState?.assignments || {}
    const employeeIds = new Map()
    const duplicateIds = new Set()
    active.forEach((profile) => {
      const id = lower(profile.employeeId)
      if (!id) return
      if (employeeIds.has(id)) { duplicateIds.add(employeeIds.get(id)); duplicateIds.add(profile.id) }
      else employeeIds.set(id, profile.id)
    })
    const expired = active.reduce((sum, profile) => sum + (profile.skillRecords || []).filter((record) => expirationState(record) === 'expired').length, 0)
    const expiring = active.reduce((sum, profile) => sum + (profile.skillRecords || []).filter((record) => expirationState(record) === 'expiring').length, 0)
    const archivedInLists = (state?.builderLists || []).reduce((sum, list) => sum + (list.builderIds || []).filter((id) => archived.some((profile) => profile.id === id)).length, 0)
    return {
      active: active.length,
      archived: archived.length,
      onToday: active.filter((profile) => assignments[profile.id]).length,
      notToday: active.filter((profile) => !assignments[profile.id]).length,
      lineLeads: active.filter((profile) => profile.isLineLead).length,
      trainers: active.filter((profile) => profile.isTrainer).length,
      safety: active.filter((profile) => profile.isSafetyMember).length,
      skilled: active.filter((profile) => profile.trainedTdr || profile.trainedForklift || profile.trainedCenterRider || profile.trainedClampTruck || profile.trainedRackMover || profile.trainedReachTruck || (profile.skills || []).length).length,
      expired,
      expiring,
      duplicateIds: duplicateIds.size,
      missingShift: active.filter((profile) => !profile.defaultShift).length,
      missingBadge: active.filter((profile) => !profile.badgeType).length,
      archivedInLists,
    }
  }, [state?.builderPool, state?.builderLists, dayState])

  const suggestions = [
    metrics.missingShift ? `${metrics.missingShift} active builder(s) have no default shift.` : '',
    metrics.duplicateIds ? `${metrics.duplicateIds} builder profile(s) share a duplicate employee ID.` : '',
    metrics.notToday ? `${metrics.notToday} active builder(s) are not assigned today.` : '',
    metrics.expired ? `${metrics.expired} certification record(s) are expired.` : '',
    metrics.expiring ? `${metrics.expiring} certification record(s) expire within 30 days.` : '',
    metrics.archivedInLists ? `${metrics.archivedInLists} archived builder membership(s) remain in static saved lists.` : '',
    metrics.missingBadge ? `${metrics.missingBadge} active builder(s) are missing a badge type.` : '',
  ].filter(Boolean)

  const openBuilders = (view) => {
    const sidebarButton = Array.from(document.querySelectorAll('[data-sidebar-nav-label]')).find((button) => String(button.dataset.sidebarNavLabel || button.textContent).toLowerCase().includes('builders'))
    sidebarButton?.click()
    setTimeout(() => window.dispatchEvent(new CustomEvent('staffboard:builder-view', { detail: { view } })), 60)
  }

  if (mode === 'suggestions') {
    return <div className="summary-card-block card builder-health-insights-card"><div className="table-title-row"><div><div className="table-kicker">Builder Health Suggestions</div><div className="small">Advisory only. No builder profile or assignment is changed automatically.</div></div><button className="secondary mini-btn" onClick={() => openBuilders('master')}>Open Builder Management</button></div><div className="list">{suggestions.length ? suggestions.map((suggestion, index) => <div className="group-summary-card" key={index}><strong className={/expired|duplicate|missing/i.test(suggestion) ? 'status-warn' : ''}>{suggestion}</strong></div>) : <div className="small status-good">No builder-profile health warnings detected.</div>}</div></div>
  }

  return <div className="summary-card-block card builder-health-insights-card"><div className="table-title-row"><div><div className="table-kicker">Builder Roster Health</div><div className="small">Permanent profile health is separate from daily attendance and production calculations.</div></div><button className="secondary mini-btn" onClick={() => openBuilders('master')}>Manage Builders</button></div><div className="summary-grid builder-health-manager-grid">{[
    ['Active', metrics.active], ['On Today', metrics.onToday], ['Not Staffed', metrics.notToday], ['Archived', metrics.archived],
    ['Line Leads', metrics.lineLeads], ['Trainers', metrics.trainers], ['Safety', metrics.safety], ['Skilled', metrics.skilled],
    ['Expired Skills', metrics.expired], ['Expiring Soon', metrics.expiring], ['Duplicate IDs', metrics.duplicateIds], ['Missing Shift', metrics.missingShift],
  ].map(([label, value]) => <div className="summary-card" key={label}><div className="summary-label">{label}</div><div className={`summary-value ${Number(value) > 0 && /Expired|Duplicate|Missing/.test(label) ? 'status-warn' : ''}`}>{value}</div></div>)}</div>{suggestions.length ? <div className="builder-health-warning-strip">{suggestions.slice(0, 4).map((suggestion) => <span key={suggestion}>{suggestion}</span>)}</div> : null}</div>
}
