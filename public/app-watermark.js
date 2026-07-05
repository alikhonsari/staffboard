(() => {
  const ID = 'staffboard-built-by-watermark'
  const STYLE_ID = 'staffboard-built-by-watermark-style'

  function addStyle() {
    if (document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
      .staffboard-watermark{
        position:fixed;
        left:14px;
        bottom:14px;
        z-index:99970;
        max-width:calc(100vw - 220px);
        padding:7px 10px;
        border:1px solid rgba(148,163,184,.32);
        border-radius:999px;
        background:rgba(255,255,255,.78);
        color:#64748b;
        box-shadow:0 8px 24px rgba(15,23,42,.07);
        backdrop-filter:blur(10px);
        -webkit-backdrop-filter:blur(10px);
        font:700 10px/1.25 Inter,Arial,sans-serif;
        letter-spacing:.01em;
        opacity:.82;
        pointer-events:none;
        user-select:none;
      }
      .staffboard-watermark strong{color:#334155;font-weight:900}
      body[data-theme="dark"] .staffboard-watermark{
        background:rgba(15,27,49,.78);
        color:#94a3b8;
        border-color:rgba(100,116,139,.38);
      }
      body[data-theme="dark"] .staffboard-watermark strong{color:#dbeafe}
      @media(max-width:720px){
        .staffboard-watermark{
          left:10px;
          right:10px;
          bottom:60px;
          max-width:none;
          text-align:center;
          font-size:9px;
        }
      }
    `
    document.head.appendChild(style)
  }

  function ensure() {
    addStyle()
    if (document.getElementById(ID)) return
    const watermark = document.createElement('div')
    watermark.id = ID
    watermark.className = 'staffboard-watermark'
    watermark.innerHTML = '<strong>Developed by Ali Khonsari</strong> · Questions, feedback, or enhancement ideas? Slack me.'
    document.body.appendChild(watermark)
  }

  document.addEventListener('DOMContentLoaded', ensure)
  ensure()
})()
