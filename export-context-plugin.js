export function exportContextPlugin() {
  return {
    name: 'staffboard-export-context',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code

      const slackStart = next.indexOf("  const slackText = (type = 'daily') => {")
      const slackEnd = slackStart >= 0 ? next.indexOf('  const copySlack = async (type) => {', slackStart) : -1
      if (slackStart >= 0 && slackEnd > slackStart) {
        const safeSlack = `  const slackText = (type = 'daily') => {
    const issues = []
    if (counts.unassigned) issues.push(counts.unassigned + ' unassigned')
    if (counts.pto) issues.push(counts.pto + ' PTO')
    if (counts.loa + counts.vto + counts.absent) issues.push((counts.loa + counts.vto + counts.absent) + ' unavailable')
    const risk = currentLiveTPH >= metrics.requiredTPH ? 'Ahead / On Target' : 'Behind by ' + Math.abs(currentLiveTPH - metrics.requiredTPH).toFixed(1) + ' TPH'
    const header = boardLabel + ' — ' + state.selectedDay + ' — Week of ' + state.weekStartDate
    const footer = 'Admin: ' + enhancementAdmin + ' | Generated: ' + new Date().toLocaleString()
    if (type === 'tph') return [header, 'Live TPH: ' + currentLiveTPH.toFixed(1) + ' | Required TPH: ' + metrics.requiredTPH.toFixed(1), 'Goal completion: ' + efficiencyPct.toFixed(0) + '% | Risk: ' + risk, footer].join(String.fromCharCode(10))
    if (type === 'issues') return [header + ' — Staffing Issues', issues.length ? issues.join(' | ') : 'No major staffing issues detected.', 'Unassigned: ' + counts.unassigned + ' | Line Leads: ' + counts.lineLeads, footer].join(String.fromCharCode(10))
    return [header, 'HC: ' + totalHeadCount + ' | Present: ' + counts.present + ' | PTO: ' + counts.pto + ' | Unassigned: ' + counts.unassigned, 'Live TPH: ' + currentLiveTPH.toFixed(1) + ' | Required TPH: ' + metrics.requiredTPH.toFixed(1), 'Risk: ' + risk, 'Issues: ' + (issues.length ? issues.join(', ') : 'none'), footer].join(String.fromCharCode(10))
  }

`
        next = next.slice(0, slackStart) + safeSlack + next.slice(slackEnd)
      }

      next = next.replace(
        '<div className="small">Week of {state.weekStartDate} · {state.selectedDay} · {state.boardShift} · Generated {new Date().toLocaleString()}</div>',
        '<div className="small">{boardLabel} · Week of {state.weekStartDate} · {state.selectedDay} · Admin {enhancementAdmin} · Generated {new Date().toLocaleString()}</div>'
      )

      next = next.replace('`weekly-staffing-board-${state.weekStartDate}-${state.selectedDay}.png`', '`${state.currentBoardId}-weekly-staffing-board-${state.weekStartDate}-${state.selectedDay}.png`')
      next = next.replace('`tph-breakdown-${state.weekStartDate}-${state.selectedDay}.png`', '`${state.currentBoardId}-tph-breakdown-${state.weekStartDate}-${state.selectedDay}.png`')
      next = next.replace('`analysis-${state.weekStartDate}.png`', '`${state.currentBoardId}-analysis-${state.weekStartDate}.png`')
      next = next.replace('`daily-report-${state.weekStartDate}-${state.selectedDay}.pdf`', '`${state.currentBoardId}-daily-report-${state.weekStartDate}-${state.selectedDay}.pdf`')
      next = next.replace('`weekly-report-${state.weekStartDate}.pdf`', '`${state.currentBoardId}-weekly-report-${state.weekStartDate}.pdf`')

      return next === code ? null : { code: next, map: null }
    },
  }
}
