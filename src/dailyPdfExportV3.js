import html2canvas from 'html2canvas'

function safeFilePart(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function selectedCalendarDate(weekStartDate, selectedDay) {
  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  const index = Math.max(0, weekdays.indexOf(selectedDay))
  const date = new Date(`${weekStartDate}T12:00:00`)
  if (Number.isNaN(date.getTime())) return String(weekStartDate || '')
  date.setDate(date.getDate() + index)
  return date.toISOString().slice(0, 10)
}

export function buildDailyPdfFilenameV3(state = {}) {
  const board = safeFilePart(state.currentBoardId || state.boardTitle || 'staffboard').toLowerCase()
  const day = safeFilePart(state.selectedDay || 'day')
  const date = selectedCalendarDate(state.weekStartDate, state.selectedDay)
  return `${board}-daily-report-${date}-${day}.pdf`
}

export async function exportDailyPdfV3(root, options = {}) {
  if (!root) throw new Error('Daily PDF report is not ready yet.')
  const pages = Array.from(root.querySelectorAll('[data-daily-pdf-page]'))
  if (!pages.length) throw new Error('Daily PDF pages were not generated.')

  const onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {}
  const filename = options.filename || 'staffboard-daily-report.pdf'
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  onStatus(`Building ${pages.length} page${pages.length === 1 ? '' : 's'}`)

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index]
    onStatus(`Rendering page ${index + 1} of ${pages.length}`)
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

    const canvas = await html2canvas(page, {
      backgroundColor: '#ffffff',
      scale: 1.6,
      useCORS: true,
      logging: false,
      imageTimeout: 0,
      width: page.scrollWidth,
      height: page.scrollHeight,
      windowWidth: page.scrollWidth,
      windowHeight: page.scrollHeight,
      scrollX: 0,
      scrollY: -window.scrollY,
      onclone: (documentClone) => {
        documentClone.documentElement.dataset.theme = 'light'
        documentClone.body.dataset.theme = 'light'
        const clonedPage = documentClone.querySelector(`[data-daily-pdf-page="${index + 1}"]`)
        if (clonedPage) {
          clonedPage.style.display = 'flex'
          clonedPage.style.visibility = 'visible'
          clonedPage.style.position = 'relative'
          clonedPage.style.left = '0'
          clonedPage.style.top = '0'
        }
      },
    })

    if (index > 0) pdf.addPage('a4', 'landscape')
    const image = canvas.toDataURL('image/jpeg', 0.94)
    pdf.addImage(image, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST')
    canvas.width = 1
    canvas.height = 1
  }

  pdf.setProperties({
    title: filename.replace(/\.pdf$/i, ''),
    subject: options.subject || 'StaffBoard daily operations report',
    author: options.author || 'StaffBoard',
    creator: 'StaffBoard Daily PDF v3',
  })

  onStatus('Download ready')
  pdf.save(filename)
  return { filename, pageCount: pages.length }
}
