(() => {
  function loadSharePng() {
    if (window.StaffBoardSharePNG) return Promise.resolve()
    if (!document.querySelector('[data-share-png-safe-file]')) {
      const script = document.createElement('script')
      script.src = '/share-png-safe.js?v=2'
      script.dataset.sharePngSafeFile = 'true'
      document.body.appendChild(script)
    }
    return new Promise((resolve) => {
      const wait = setInterval(() => {
        if (window.StaffBoardSharePNG) {
          clearInterval(wait)
          resolve()
        }
      }, 50)
      setTimeout(() => { clearInterval(wait); resolve() }, 1500)
    })
  }

  async function clickSharePng() {
    await loadSharePng()
    if (window.StaffBoardSharePNG?.open) window.StaffBoardSharePNG.open()
    else alert('Share PNG is loading. Tap Share PNG again in a second.')
  }

  function addStyle() {
    if (document.getElementById('share-png-float-style')) return
    const style = document.createElement('style')
    style.id = 'share-png-float-style'
    style.textContent = `
      .share-png-float{position:fixed!important;right:14px!important;top:58px!important;left:auto!important;bottom:auto!important;z-index:100060!important;width:auto!important;min-width:0!important;max-width:none!important;height:auto!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;border:0!important;border-radius:999px!important;background:#2563eb!important;color:white!important;font:900 12px Arial!important;line-height:1!important;padding:9px 13px!important;box-shadow:0 12px 30px rgba(37,99,235,.26)!important;cursor:pointer!important}
      .share-png-float:hover{filter:brightness(1.08)!important}
      body[data-theme="dark"] .share-png-float{background:#7dd3fc!important;color:#071421!important}
      @media(max-width:720px){.share-png-float{right:12px!important;top:104px!important;font-size:12px!important;padding:9px 12px!important;width:auto!important}}
    `
    document.head.appendChild(style)
  }

  function ensure() {
    addStyle()
    if (document.querySelector('[data-share-png-float]')) return
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'share-png-float'
    button.dataset.sharePngFloat = 'true'
    button.textContent = 'Share PNG'
    button.addEventListener('click', clickSharePng)
    document.body.appendChild(button)
  }

  document.addEventListener('DOMContentLoaded', ensure)
  setInterval(ensure, 2000)
  ensure()
})()