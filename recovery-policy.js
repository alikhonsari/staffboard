const clean = (value) => String(value || '').trim()

export function mondayKey(value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(value)
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12))
  const day = utc.getUTCDay()
  utc.setUTCDate(utc.getUTCDate() + (day === 0 ? -6 : 1 - day))
  return utc.toISOString().slice(0, 10)
}

export function retainUniqueNewest(rows = [], limit = 100) {
  const max = Math.max(1, Number(limit || 1))
  const seen = new Set()
  const sorted = [...rows].sort((left, right) => String(right.createdAt || right.timestamp || '').localeCompare(String(left.createdAt || left.timestamp || '')))
  const unique = sorted.filter((row) => {
    const id = clean(row?.id)
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
  return { keep: unique.slice(0, max), remove: unique.slice(max) }
}

export function calendarBackupPlan(index = [], now = new Date()) {
  const date = now instanceof Date ? new Date(now) : new Date(now)
  const dateKey = date.toISOString().slice(0, 10)
  const weekKey = mondayKey(date)
  return {
    dateKey,
    weekKey,
    needsDaily: !index.some((item) => item.kind === 'daily' && String(item.createdAt || '').slice(0, 10) === dateKey),
    needsWeekly: !index.some((item) => item.kind === 'weekly' && item.weekBackupKey === weekKey),
  }
}

export function retentionSummary(rows = [], limit = 100) {
  const { keep, remove } = retainUniqueNewest(rows, limit)
  return {
    kept: keep.length,
    removed: remove.length,
    oldestKept: keep.at(-1)?.createdAt || keep.at(-1)?.timestamp || '',
    newestKept: keep[0]?.createdAt || keep[0]?.timestamp || '',
  }
}
