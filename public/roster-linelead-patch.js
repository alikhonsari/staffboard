(() => {
  function toNumber(text) {
    const n = Number(String(text || '').replace(/[^0-9.-]/g, ''))
    return Number.isFinite(n) ? n : null
  }

  function readMainLineLeadCount() {
    const cards = Array.from(document.querySelectorAll('.kpi, .ops, .snapshot-stat'))
      .filter((card) => !card.closest('[data-builder-health-stable]'))
    for (const card of cards) {
      const label = String(card.querySelector('.kpi-label, .ops-label, span')?.textContent || '').trim().toLowerCase()
      if (label !== 'line leads') continue
      const value = toNumber(card.querySelector('.kpi-value, .ops-value, strong, .numchip')?.textContent)
      if (value != null) return value
    }
    return null
  }

  function patchRosterLineLeads() {
    const value = readMainLineLeadCount()
    if (value == null) return
    const health = document.querySelector('[data-builder-health-stable]')
    if (!health) return
    const cards = Array.from(health.querySelectorAll('.builder-health-kpi'))
    const lineLeadCard = cards.find((card) => String(card.querySelector('span')?.textContent || '').trim().toLowerCase() === 'line leads')
    const number = lineLeadCard?.querySelector('strong')
    if (number && number.textContent !== String(value)) number.textContent = String(value)
  }

  document.addEventListener('DOMContentLoaded', patchRosterLineLeads)
  setInterval(patchRosterLineLeads, 1000)
  setTimeout(patchRosterLineLeads, 300)
  setTimeout(patchRosterLineLeads, 1500)
})()
