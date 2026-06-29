(() => {
  let fixed = false
  function repair() {
    if (fixed) return
    const card = document.querySelector('.login-card')
    const txt = String(card?.textContent || '')
    if (!/checking session/i.test(txt)) return
    fixed = true
    try {
      localStorage.removeItem('staffboard2_token')
      localStorage.removeItem('staffboard2_user')
    } catch {}
    setTimeout(() => window.location.reload(), 300)
  }
  document.addEventListener('DOMContentLoaded', () => setTimeout(repair, 1000))
  setInterval(repair, 1000)
})()
