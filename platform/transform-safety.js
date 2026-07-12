function countOccurrences(source, marker) {
  if (!marker) return 0
  return String(source).split(marker).length - 1
}

export function assertTransformMarkers(source, specification = {}) {
  const missing = []
  const duplicates = []
  for (const marker of specification.required || []) {
    if (!String(source).includes(marker)) missing.push(marker)
  }
  for (const marker of specification.unique || []) {
    const count = countOccurrences(source, marker)
    if (count > 1) duplicates.push({ marker, count })
  }
  const result = { ok: missing.length === 0 && duplicates.length === 0, missing, duplicates }
  if (!result.ok) {
    const parts = []
    if (missing.length) parts.push(`missing markers: ${missing.join(', ')}`)
    if (duplicates.length) parts.push(`duplicate markers: ${duplicates.map((item) => `${item.marker} (${item.count})`).join(', ')}`)
    const error = new Error(`StaffBoard transform safety validation failed: ${parts.join('; ')}`)
    error.code = 'TRANSFORM_MARKER_VALIDATION_FAILED'
    error.details = result
    throw error
  }
  return result
}

export function transformDiagnostic(source, specification = {}) {
  const markers = [...new Set([...(specification.required || []), ...(specification.unique || [])])]
  return {
    id: specification.id || 'unknown',
    markers: markers.map((marker) => ({ marker, count: countOccurrences(source, marker) })),
  }
}

export const __test = { countOccurrences }
