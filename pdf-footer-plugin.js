export function pdfFooterPlugin() {
  return {
    name: 'staffboard-pdf-footer',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx') || code.includes('pdf.getNumberOfPages()')) return null
      const footer = `    const totalPages = pdf.getNumberOfPages()\n    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {\n      pdf.setPage(pageNumber)\n      pdf.setFontSize(7)\n      pdf.setTextColor(100, 116, 139)\n      pdf.text((BOARD_PRESETS[state.currentBoardId]?.title || state.boardTitle) + ' · ' + pdfShiftName + ' · Admin: ' + reportAdminName, margin, pageHeight - 3)\n      pdf.text('Page ' + pageNumber + ' of ' + totalPages, pageWidth - margin, pageHeight - 3, { align: 'right' })\n    }\n`
      const next = code.replace('    pdf.save(filename)', footer + '    pdf.save(filename)')
      return next === code ? null : { code: next, map: null }
    },
  }
}
