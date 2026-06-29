(() => {
  const STYLE_ID = 'tph-rack-sidecar-style'
  const ROW_CLASS = 'tph-rack-sidecar-row'

  function addStyle() {
    if (document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
      .${ROW_CLASS}{
        display:grid!important;
        grid-template-columns:minmax(380px,.88fr) minmax(520px,1.12fr)!important;
        gap:12px!important;
        align-items:start!important;
        width:100%!important;
        margin:12px 0!important;
      }
      .${ROW_CLASS}>.card,
      .${ROW_CLASS}>.summary-card-block,
      .${ROW_CLASS}>.dashboard-card{
        margin:0!important;
        width:100%!important;
        max-width:none!important;
        min-width:0!important;
        align-self:start!important;
        box-sizing:border-box!important;
      }
      .${ROW_CLASS} .table-kicker{font-size:12px!important;line-height:1.15!important}
      .${ROW_CLASS} .small{font-size:12px!important;line-height:1.25!important}
      .${ROW_CLASS} input,.${ROW_CLASS} textarea,.${ROW_CLASS} select{max-width:100%!important}
      .${ROW_CLASS} .line-lead-card,.${ROW_CLASS} .builder-card,.${ROW_CLASS} .tag{box-sizing:border-box!important}
      @media(max-width:1150px){.${ROW_CLASS}{grid-template-columns:1fr!important}}
    `
    document.head.appendChild(style)
  }

  function closestCard(el) {
    return el?.closest?.('.card,.summary-card-block,.dashboard-card') || null
  }

  function findCardByText(pattern) {
    const nodes = Array.from(document.querySelectorAll('.table-kicker,h2,h3,.ops-title,.opsx-title,.title'))
    for (const node of nodes) {
      if (pattern.test(node.textContent || '')) {
        const card = closestCard(node)
        if (card) return card
      }
    }
    const cards = Array.from(document.querySelectorAll('.card,.summary-card-block,.dashboard-card'))
    return cards.find((card) => pattern.test(card.textContent || '')) || null
  }

  function layout() {
    addStyle()
    const tph = findCardByText(/\bTPH\s+Reporting\b/i)
    const rack = findCardByText(/\bRack ID Summary\b/i)
    if (!tph || !rack || tph === rack) return
    if (tph.closest(`.${ROW_CLASS}`) && rack.closest(`.${ROW_CLASS}`)) return

    const row = document.createElement('div')
    row.className = ROW_CLASS
    row.dataset.tphRackSidecar = 'true'
    tph.parentNode.insertBefore(row, tph)
    row.appendChild(tph)
    row.appendChild(rack)
  }

  document.addEventListener('DOMContentLoaded', layout)
  new MutationObserver(layout).observe(document.body, { childList: true, subtree: true })
  setInterval(layout, 1500)
  layout()
})()
