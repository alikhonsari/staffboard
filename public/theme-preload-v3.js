(() => {
  const normalizeUser = (value) => String(value || 'local-user').toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
  const valid = (value) => value === 'dark' || value === 'light'

  let theme = ''
  try {
    const lastUser = localStorage.getItem('staffboard.theme.last-user') || 'local-user'
    const saved = localStorage.getItem(`staffboard.theme.${normalizeUser(lastUser)}`)
    const preload = localStorage.getItem('staffboard.theme.preload')
    if (valid(saved)) theme = saved
    else if (valid(preload)) theme = preload
  } catch {}

  if (!valid(theme)) {
    theme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme

  const meta = document.querySelector('meta[name="theme-color"]') || document.createElement('meta')
  meta.name = 'theme-color'
  meta.content = theme === 'dark' ? '#111c2d' : '#eef3f8'
  if (!meta.parentNode) document.head.appendChild(meta)
})()
