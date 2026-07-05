export function reportExportPlugin() {
  return {
    name: 'staffboard-report-exports',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null

      let next = code

      const reportVarsMarker = '  const builderWeeklyAreaHours = useMemo(() => {'
      if (!next.includes('const reportAdminName =')) {
        const reportVars = `  const reportAdminName = user?.username || state.adminName || state.boardLead || 'Not set'\n  const reportShiftWindow = isNightShiftLabel(state.boardShift) ? '5:00 PM - 1:30 AM' : '8:00 AM - 4:30 PM'\n  const dailyPdfRackRows = [\n    ...parseRackList(dayState.rackLists?.processed).map((row) => ({ ...row, listType: 'Processed / Recovery' })),\n    ...parseRackList(dayState.rackLists?.prepped).map((row) => ({ ...row, listType: 'Prepped / Rack Prep' })),\n  ]\n  const weeklyPdfRackRows = useMemo(() => WEEKDAYS.flatMap((day) => {\n    const data = state.weeklyData?.[day] || defaultDay()\n    return [\n      ...parseRackList(data.rackLists?.processed).map((row) => ({ ...row, day, listType: 'Processed / Recovery' })),\n      ...parseRackList(data.rackLists?.prepped).map((row) => ({ ...row, day, listType: 'Prepped / Rack Prep' })),\n    ]\n  }), [state.weeklyData])\n\n`
        next = next.replace(reportVarsMarker, reportVars + reportVarsMarker)
      }

      next = next.replaceAll("{state.adminName || 'Not set'}", '{reportAdminName}')
      next = next.replace(
        '<div className="pdf-report-meta">Week of {state.weekStartDate} - {state.selectedDay} - {state.boardShift}</div>',
        '<div className="pdf-report-meta">Week of {state.weekStartDate} · {state.selectedDay} · {state.boardShift} · {reportShiftWindow}</div>'
      )
      next = next.replace(
        '<div className="pdf-report-meta">Week of {state.weekStartDate} - Monday to Friday</div>',
        '<div className="pdf-report-meta">Week of {state.weekStartDate} · Monday to Friday · {state.boardShift} · {reportShiftWindow}</div>'
      )
      next = next.replaceAll(
        '<div><span>Generated</span><strong>{new Date().toLocaleString()}</strong></div>',
        '<div><span>Shift</span><strong>{state.boardShift}</strong></div><div><span>Hours</span><strong>{reportShiftWindow}</strong></div><div><span>Generated</span><strong>{new Date().toLocaleString()}</strong></div>'
      )

      next = next.replace(
        '              selectedDay: state.selectedDay,\n            })}>Individual Day Excel</button>',
        '              selectedDay: state.selectedDay,\n              adminName: reportAdminName,\n            })}>Individual Day Excel</button>'
      )
      next = next.replace(
        '              areaDefs: AREA_DEFS,\n            })}>Weekly Excel (All 5 Days + Hours)</button>',
        '              areaDefs: AREA_DEFS,\n              adminName: reportAdminName,\n            })}>Weekly Excel (All 5 Days + Hours)</button>'
      )

      const oldPdfFunction = `  const exportElementToPdf = async (element, filename) => {\n    if (!element) return\n    const { jsPDF } = await import('jspdf')\n    const canvas = await html2canvas(element, {\n      backgroundColor: '#ffffff',\n      scale: 2,\n      useCORS: true,\n      logging: false,\n      windowWidth: element.scrollWidth,\n      windowHeight: element.scrollHeight,\n    })\n    const imgData = canvas.toDataURL('image/png')\n    const pdf = new jsPDF('p', 'mm', 'a4')\n    const pageWidth = pdf.internal.pageSize.getWidth()\n    const pageHeight = pdf.internal.pageSize.getHeight()\n    const margin = 8\n    const imgWidth = pageWidth - margin * 2\n    const imgHeight = (canvas.height * imgWidth) / canvas.width\n    let heightLeft = imgHeight\n    let position = margin\n\n    pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight, undefined, 'FAST')\n    heightLeft -= (pageHeight - margin * 2)\n\n    while (heightLeft > 0) {\n      position = heightLeft - imgHeight + margin\n      pdf.addPage()\n      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight, undefined, 'FAST')\n      heightLeft -= (pageHeight - margin * 2)\n    }\n\n    pdf.save(filename)\n  }`

      const newPdfFunction = `  const exportElementToPdf = async (element, filename) => {\n    if (!element) return\n    const { jsPDF } = await import('jspdf')\n    const canvas = await html2canvas(element, {\n      backgroundColor: '#ffffff',\n      scale: 2.2,\n      useCORS: true,\n      logging: false,\n      imageTimeout: 0,\n      windowWidth: element.scrollWidth,\n      windowHeight: element.scrollHeight,\n    })\n    const pdf = new jsPDF('p', 'mm', 'a4')\n    const pageWidth = pdf.internal.pageSize.getWidth()\n    const pageHeight = pdf.internal.pageSize.getHeight()\n    const margin = 8\n    const printableWidth = pageWidth - margin * 2\n    const printableHeight = pageHeight - margin * 2\n    const pixelsPerMm = canvas.width / printableWidth\n    const pageHeightPx = Math.floor(printableHeight * pixelsPerMm)\n    let sourceY = 0\n    let pageIndex = 0\n\n    while (sourceY < canvas.height) {\n      const sliceHeight = Math.min(pageHeightPx, canvas.height - sourceY)\n      const pageCanvas = document.createElement('canvas')\n      pageCanvas.width = canvas.width\n      pageCanvas.height = sliceHeight\n      const ctx = pageCanvas.getContext('2d')\n      ctx.fillStyle = '#ffffff'\n      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)\n      ctx.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)\n\n      if (pageIndex > 0) pdf.addPage()\n      const imageHeight = sliceHeight / pixelsPerMm\n      pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', margin, margin, printableWidth, imageHeight, undefined, 'FAST')\n      sourceY += sliceHeight\n      pageIndex += 1\n    }\n\n    pdf.setProperties({\n      title: filename.replace(/\\.pdf$/i, ''),\n      subject: state.boardTitle + ' operations report',\n      author: reportAdminName,\n      creator: 'StaffBoard 2.0',\n    })\n    pdf.save(filename)\n  }`

      next = next.replace(oldPdfFunction, newPdfFunction)

      const weeklyMarker = '          <div ref={weeklyPdfRef} className="pdf-report-sheet">'
      if (!next.includes('Daily Rack IDs / Material Types')) {
        const dailyExtra = `            <div className="pdf-report-section-title">Daily Rack IDs / Material Types</div>\n            <div className="pdf-chart-card pdf-table-card">\n              <table className="pdf-mini-table">\n                <thead><tr><th>List</th><th>Rack ID</th><th>Material Type</th></tr></thead>\n                <tbody>\n                  {dailyPdfRackRows.length ? dailyPdfRackRows.map((row, index) => (\n                    <tr key={\`${'${row.listType}'}-${'${row.id}'}-${'${index}'}\`}><td>{row.listType}</td><td>{row.id}</td><td>{row.materialType}</td></tr>\n                  )) : <tr><td colSpan="3">No rack entries for this day.</td></tr>}\n                </tbody>\n              </table>\n            </div>\n          </div>\n\n`
        next = next.replace('          </div>\n\n' + weeklyMarker, dailyExtra + weeklyMarker)
      }

      const weeklyCloseMarker = `                </tbody>\n              </table>\n            </div>\n          </div>\n        </div>\n\n      </main>`
      if (!next.includes('Builder Hours by Area - Whole Week')) {
        const weeklyExtra = `                </tbody>\n              </table>\n            </div>\n\n            <div className="pdf-report-section-title">Builder Hours by Area - Whole Week</div>\n            <div className="pdf-chart-card pdf-table-card">\n              <table className="pdf-mini-table">\n                <thead><tr><th>Builder</th><th>Area</th><th>Hours</th></tr></thead>\n                <tbody>\n                  {builderWeeklyAreaHours.length ? builderWeeklyAreaHours.flatMap((row) => row.areas.map(([area, hours]) => (\n                    <tr key={\`${'${row.builder.id}'}-${'${area}'}\`}><td>{row.builder.name}</td><td>{area}</td><td>{Number(hours).toFixed(2)}</td></tr>\n                  ))) : <tr><td colSpan="3">No builder hours recorded for this week.</td></tr>}\n                </tbody>\n              </table>\n            </div>\n\n            <div className="pdf-report-section-title">Weekly Rack IDs / Material Types</div>\n            <div className="pdf-chart-card pdf-table-card">\n              <table className="pdf-mini-table">\n                <thead><tr><th>Day</th><th>List</th><th>Rack ID</th><th>Material Type</th></tr></thead>\n                <tbody>\n                  {weeklyPdfRackRows.length ? weeklyPdfRackRows.map((row, index) => (\n                    <tr key={\`${'${row.day}'}-${'${row.listType}'}-${'${row.id}'}-${'${index}'}\`}><td>{row.day}</td><td>{row.listType}</td><td>{row.id}</td><td>{row.materialType}</td></tr>\n                  )) : <tr><td colSpan="4">No rack entries recorded for this week.</td></tr>}\n                </tbody>\n              </table>\n            </div>\n          </div>\n        </div>\n\n      </main>`
        next = next.replace(weeklyCloseMarker, weeklyExtra)
      }

      return next === code ? null : { code: next, map: null }
    },
  }
}
