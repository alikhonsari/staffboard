(() => {
  function text(el) {
    return String(el?.textContent || '').trim()
  }

  function currentUserName() {
    const signedIn = document.querySelector('.auth-section strong')
    return text(signedIn)
  }

  function setInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    if (setter) setter.call(input, value)
    else input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function findAdminInput() {
    const labels = Array.from(document.querySelectorAll('label'))
    const label = labels.find((el) => text(el).toLowerCase() === 'admin / line lead name')
    return label?.parentElement?.querySelector('input') || null
  }

  function patchAdminName() {
    const username = currentUserName()
    if (!username) return

    const input = findAdminInput()
    if (input && input.value !== username) setInputValue(input, username)

    document.querySelectorAll('.board-header .pill').forEach((pill) => {
      if (text(pill).toLowerCase().startsWith('admin:')) {
        pill.textContent = `Admin: ${username}`
      }
    })
  }

  document.addEventListener('DOMContentLoaded', patchAdminName)
  setInterval(patchAdminName, 1000)
  setTimeout(patchAdminName, 500)
  setTimeout(patchAdminName, 2000)
})()
