(() => {
  const originalFetch = window.fetch?.bind(window)
  if (!originalFetch || window.__staffboardAuthTimeoutInstalled) return
  window.__staffboardAuthTimeoutInstalled = true

  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input?.url || '')
    const isSessionCheck = String(url).includes('/api/me')
    if (!isSessionCheck) return originalFetch(input, init)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const nextInit = { ...init, signal: init.signal || controller.signal }

    return originalFetch(input, nextInit).finally(() => clearTimeout(timer))
  }

  function clearStuckSession() {
    const card = document.querySelector('.login-card')
    const text = String(card?.textContent || '')
    if (!/checking session/i.test(text)) return

    if (!card.querySelector('[data-clear-stuck-session]')) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.dataset.clearStuckSession = 'true'
      btn.className = 'secondary login-button'
      btn.textContent = 'Clear saved session and reload'
      btn.style.marginTop = '12px'
      btn.onclick = () => {
        localStorage.removeItem('staffboard2_token')
        localStorage.removeItem('staffboard2_user')
        window.location.reload()
      }
      card.appendChild(btn)
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(clearStuckSession, 3000)
    setTimeout(() => {
      const card = document.querySelector('.login-card')
      const text = String(card?.textContent || '')
      if (/checking session/i.test(text)) {
        localStorage.removeItem('staffboard2_token')
        localStorage.removeItem('staffboard2_user')
        window.location.reload()
      }
    }, 8000)
  })
})()
