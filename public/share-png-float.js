(() => {
  function loadSharePng() {
    if (window.StaffBoardSharePNG) return Promise.resolve()
    if (!document.querySelector('[data-share-png-safe-file]')) {
      const script = document.createElement('script')
      script.src = '/share-png-safe.js?v=1'
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
      .share-png-float{position:fixed;right:14px;top:58px;z-index:100060;border:0;border-radius:999px;background:#2563eb;color:white;font:900 12px Arial;padding:9px 13px;box-shadow:0 12px 30px rgba(37,99,235,.26);cursor:pointer}
      .share-png-float:hover{filter:brightness(1.08)}
      body[data-theme="dark"] .share-png-float{background:#7dd3fc;color:#071421}
      @media(max-width:720px){.share-png-float{right:12px;top:104px;font-size:12px;padding:9px 12px}}
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
