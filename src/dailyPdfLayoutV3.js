export const DAILY_PDF_V3_VERSION = '3.0'

const DEFAULT_PAGE_WEIGHT = 650

const SECTION_RULES = {
  areaOverflow: { base: 70, row: 25, maxRows: 16 },
  racks: { base: 70, row: 24, maxRows: 22 },
  exceptions: { base: 70, row: 27, maxRows: 16 },
  skills: { base: 70, row: 25, maxRows: 14 },
  laborShare: { base: 80, row: 28, maxRows: 14 },
  speedLite: { base: 80, row: 30, maxRows: 12 },
  notes: { base: 80, row: 46, maxRows: 6 },
}

export function chunkRows(rows, size) {
  const source = Array.isArray(rows) ? rows : []
  if (!source.length) return []
  const chunks = []
  for (let index = 0; index < source.length; index += size) chunks.push(source.slice(index, index + size))
  return chunks
}

export function expandDailyPdfSections(sections) {
  return (Array.isArray(sections) ? sections : []).flatMap((section) => {
    if (!section || section.visible === false) return []
    const rules = SECTION_RULES[section.key] || { base: 70, row: 25, maxRows: 16 }
    const rows = Array.isArray(section.rows) ? section.rows : []
    const chunks = rows.length ? chunkRows(rows, section.maxRows || rules.maxRows) : [[]]
    return chunks.map((chunk, chunkIndex) => ({
      ...section,
      rows: chunk,
      chunkIndex,
      chunkCount: chunks.length,
      estimatedWeight: Number(section.estimatedWeight || (rules.base + Math.max(1, chunk.length) * rules.row)),
    }))
  })
}

export function packDailyPdfDetailPages(sections, maxWeight = DEFAULT_PAGE_WEIGHT) {
  const expanded = expandDailyPdfSections(sections)
  const pages = []
  let current = []
  let weight = 0

  expanded.forEach((section) => {
    const nextWeight = Math.min(maxWeight, Math.max(40, Number(section.estimatedWeight || 0)))
    if (current.length && weight + nextWeight > maxWeight) {
      pages.push(current)
      current = []
      weight = 0
    }
    current.push(section)
    weight += nextWeight
  })

  if (current.length) pages.push(current)
  return pages
}

export function composeDailyPdfPagePlan({ sections = [], maxWeight = DEFAULT_PAGE_WEIGHT } = {}) {
  const detailPages = packDailyPdfDetailPages(sections, maxWeight)
  return {
    summaryPage: { type: 'summary' },
    detailPages,
    pageCount: 1 + detailPages.length,
  }
}

export function runDailyPdfFixtureChecks() {
  const empty = composeDailyPdfPagePlan({ sections: [] })
  if (empty.pageCount !== 1) throw new Error('Empty-day Daily PDF must remain one page')

  const normal = composeDailyPdfPagePlan({
    sections: [
      { key: 'exceptions', rows: Array.from({ length: 4 }, (_, index) => ({ index })) },
      { key: 'skills', rows: Array.from({ length: 5 }, (_, index) => ({ index })) },
    ],
  })
  if (normal.pageCount < 2 || normal.pageCount > 3) throw new Error('Normal Daily PDF should use one compact detail page')

  const large = composeDailyPdfPagePlan({
    sections: [
      { key: 'racks', rows: Array.from({ length: 110 }, (_, index) => ({ index })) },
      { key: 'exceptions', rows: Array.from({ length: 28 }, (_, index) => ({ index })) },
      { key: 'laborShare', rows: Array.from({ length: 20 }, (_, index) => ({ index })) },
    ],
  })
  if (large.pageCount < 5) throw new Error('Large Daily PDF fixture must expand to multiple explicit pages')

  return { empty: empty.pageCount, normal: normal.pageCount, large: large.pageCount }
}
