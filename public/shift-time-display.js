(() => {
  const KEY = 'staffing_board_redo_complete_v2_weekly'

  function stateText() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || '{}')
      return `${s.currentBoardId || ''} ${s.boardShift || ''}`.toLowerCase()
    } catch {
      return ''
    }
  }

  function wantedEnd() {
    return stateText().includes('night') ? '1:30 AM' : '4:30 PM'
  }

  function run() {
    Array.from(document.querySelectorAll('.chip')).forEach((chip) => {
      const label = String(chip.querySelector('span')?.textContent || '').trim().toLowerCase()
      if (label !== 'shift ends') return
      const value = chip.querySelector('.numchip')
      if (value) value.textContent = wantedEnd()
    })
  }

  document.addEventListener('DOMContentLoaded', run)
  setInterval(run, 1000)
  setTimeout(run, 250)
  setTimeout(run, 1250)
})()
