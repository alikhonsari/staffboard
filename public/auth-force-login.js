(() => {
  const token = localStorage.getItem('staffboard2_token') || ''
  const user = localStorage.getItem('staffboard2_user') || ''
  const bypass = new URLSearchParams(window.location.search).get('keepSession') === '1'

  if (bypass) return
  if (!token && !user) return

  localStorage.removeItem('staffboard2_token')
  localStorage.removeItem('staffboard2_user')

  window.__STAFFBOARD_CLEARED_STALE_SESSION__ = true
})()
