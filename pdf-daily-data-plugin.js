export function pdfDailyDataPlugin() {
  return {
    name: 'staffboard-pdf-daily-data',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      const marker = '  const builderWeeklyAreaHours = useMemo(() => {'
      if (code.includes('const dailyPdfExceptions =')) return null
      const data = `  const pdfShiftName = BOARD_PRESETS[state.currentBoardId]?.shift || state.boardShift || 'Day Shift'\n  const pdfNightShift = isNightShiftLabel(pdfShiftName)\n  const pdfStartMinute = pdfNightShift ? 1020 : 480\n  const pdfEndMinute = pdfNightShift ? 1530 : 990\n  const pdfProfiles = new Map((state.builderPool || []).map((b) => [b.id, b]))\n  const pdfTimeMinute = (value) => {\n    if (!/^\\d{2}:\\d{2}$/.test(String(value || ''))) return null\n    const parts = String(value).split(':').map(Number)\n    let total = parts[0] * 60 + parts[1]\n    if (pdfNightShift && total <= 90) total += 1440\n    return total\n  }\n  const pdfSkills = [['TDR','trainedTdr'],['Forklift','trainedForklift'],['Center Rider','trainedCenterRider'],['Clamp Truck','trainedClampTruck'],['Rack Mover','trainedRackMover'],['Reach Truck','trainedReachTruck'],['Trainer','isTrainer'],['Safety','isSafetyMember']]\n  const dailyPdfSkillCoverage = pdfSkills.map(([label, key]) => ({ label, count: activeBuilders.filter((b) => staffedStatuses().includes(getAssignment(b.id).status || 'Present') && !!pdfProfiles.get(b.id)?.[key]).length }))\n  const dailyPdfExceptions = activeBuilders.map((builder) => {\n    const a = getAssignment(builder.id)\n    const profile = pdfProfiles.get(builder.id) || builder\n    const status = a.status || 'Present'\n    const area = a.area || 'Unassigned'\n    const reasons = []\n    if (['PTO','LOA','VTO','Absent'].includes(status)) reasons.push(status)\n    if (staffedStatuses().includes(status) && area === 'Unassigned' && !profile.isLineLead) reasons.push('Unassigned')\n    const clockIn = pdfTimeMinute(a.clockInTime)\n    const clockOut = pdfTimeMinute(a.leaveTime)\n    if (clockIn != null && clockIn > pdfStartMinute) reasons.push('Late ' + (clockIn - pdfStartMinute) + ' min')\n    if (clockOut != null && clockOut < pdfEndMinute) reasons.push('Early ' + (pdfEndMinute - clockOut) + ' min')\n    return { builder: builder.name, status, area, clockIn: a.clockInTime || '', clockOut: a.leaveTime || '', reason: reasons.join(' · ') }\n  }).filter((row) => row.reason)\n\n`
      const next = code.replace(marker, data + marker)
      return next === code ? null : { code: next, map: null }
    },
  }
}
