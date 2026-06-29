(() => {
  const MATERIAL_ORDER = ['Media', 'Decom', 'NTE', 'E&O']

  function cleanText(value) {
    return String(value || '').replace(/\u00a0/g, ' ').trim()
  }
  function normalizeMaterial(raw) {
    const text = cleanText(raw)
    const low = text.toLowerCase()
    if (!text) return 'Unspecified'
    if (/\bmedia\b|\bmed\b/.test(low)) return 'Media'
    if (/\bdecom\b|decommission/.test(low)) return 'Decom'
    if (/\bnte\b/.test(low)) return 'NTE'
    if (/\be\s*&\s*o\b|\be\s+and\s+o\b|\be&o\b/.test(low)) return 'E&O'
    return text.toUpperCase()
  }
  function parseRackPaste(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map((line) => cleanText(line))
      .filter(Boolean)
      .map((line) => {
        let rackId = ''
        let material = ''
        const tabParts = line.split(/\t+/).map(cleanText).filter(Boolean)
        if (tabParts.length > 1) {
          rackId = tabParts[0]
          material = tabParts.slice(1).join(' ')
        } else {
          const csvParts = line.split(/,/).map(cleanText).filter(Boolean)
          if (csvParts.length > 1) {
            rackId = csvParts[0]
            material = csvParts.slice(1).join(' ')
          } else {
            const parts = line.split(/\s+/).filter(Boolean)
            rackId = parts.shift() || ''
            material = parts.join(' ')
          }
        }
        return {
          id: String(rackId || '').trim(),
          materialRaw: String(material || '').trim(),
          materialType: normalizeMaterial(material),
          raw: line,
        }
      })
      .filter((row) => row.id)
  }
  function materialCounts(rows) {
    const counts = {}
    rows.forEach((row) => { counts[row.materialType] = (counts[row.materialType] || 0) + 1 })
    return counts
  }
  function countsText(rows) {
    const counts = materialCounts(rows)
    const keys = [...MATERIAL_ORDER.filter((k) => counts[k]), ...Object.keys(counts).filter((k) => !MATERIAL_ORDER.includes(k)).sort()]
    return keys.length ? keys.map((k) => `${k}: ${counts[k]}`).join(' · ') : 'None'
  }
  function ancestorText(el) {
    const box = el?.closest?.('.row,.section,.card,div') || el?.parentElement
    return (box?.textContent || '').toLowerCase()
  }
  function findPasteTextarea(kind) {
    const words = kind === 'prepped' ? ['paste', 'racks', 'prepped'] : ['paste', 'racks', 'processed']
    return Array.from(document.querySelectorAll('textarea')).find((field) => words.every((w) => ancestorText(field).includes(w))) || null
  }
  function findNumberInput(labelText) {
    const target = labelText.toLowerCase()
    const labels = Array.from(document.querySelectorAll('label'))
    const label = labels.find((el) => (el.textContent || '').trim().toLowerCase() === target)
    const box = label?.closest?.('div') || label?.parentElement
    return box?.querySelector?.('input') || null
  }
  function setReactInputValue(input, value) {
    if (!input || String(input.value) === String(value)) return
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    if (setter) setter.call(input, String(value))
    else input.value = String(value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }
  function updateSmallCount(field, rows) {
    const box = field?.closest?.('div') || field?.parentElement
    const smalls = Array.from(box?.querySelectorAll?.('.small') || [])
    const countLine = smalls.find((el) => /count\s*:/i.test(el.textContent || ''))
    if (countLine) countLine.textContent = `Count: ${rows.length} · Material Types: ${countsText(rows)}`
  }
  function setOpsValue(label, value) {
    const cards = Array.from(document.querySelectorAll('.ops'))
    const card = cards.find((el) => (el.querySelector('.ops-label')?.textContent || '').trim().toLowerCase() === label.toLowerCase())
    const node = card?.querySelector('.ops-value')
    if (node) node.textContent = String(value)
  }
  function patch() {
    const prepped = findPasteTextarea('prepped')
    const processed = findPasteTextarea('processed')
    const preRows = parseRackPaste(prepped?.value || '')
    const proRows = parseRackPaste(processed?.value || '')

    if (prepped) updateSmallCount(prepped, preRows)
    if (processed) updateSmallCount(processed, proRows)

    setReactInputValue(findNumberInput('Racks Prepped'), preRows.length)
    setReactInputValue(findNumberInput('Racks Processed'), proRows.length)

    setOpsValue('Prepped Rack IDs', preRows.length)
    setOpsValue('Processed Rack IDs', proRows.length)
    setOpsValue('Material Types', countsText([...preRows, ...proRows]))
  }
  function bind() {
    ;['prepped', 'processed'].forEach((kind) => {
      const field = findPasteTextarea(kind)
      if (!field || field.dataset.rackPasteMaterialsBound) return
      field.dataset.rackPasteMaterialsBound = 'true'
      field.addEventListener('input', () => setTimeout(patch, 0))
      field.addEventListener('paste', () => setTimeout(patch, 0))
      field.addEventListener('change', () => setTimeout(patch, 0))
    })
  }
  function tick() {
    bind()
    patch()
  }
  document.addEventListener('DOMContentLoaded', tick)
  new MutationObserver(tick).observe(document.body, { childList: true, subtree: true })
  setInterval(tick, 1000)
  tick()
})()
