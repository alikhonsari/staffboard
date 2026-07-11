import { injectAppCore } from './day-closure-app-core-transform.js'
import { injectAppUi } from './day-closure-app-ui-transform.js'
import { injectReporting } from './day-closure-report-transform.js'
import { injectDailyPdf } from './day-closure-pdf-transform.js'

const closureCss = `
.site-closure-banner{display:flex;gap:14px;align-items:flex-start;margin:12px 0;padding:16px 18px;border:2px solid #b91c1c;border-radius:14px;background:#fff1f2;color:#7f1d1d;box-shadow:0 8px 24px rgba(127,29,29,.12)}
.site-closure-banner strong{display:block;font-size:18px;letter-spacing:.02em}.site-closure-banner small{display:block;margin-top:6px;line-height:1.45}.site-closure-icon{font-size:24px}.dark .site-closure-banner{background:#3f1118;color:#fecdd3;border-color:#fb7185}
.closure-header-actions{display:flex;flex-direction:column;align-items:flex-end;gap:8px}.closure-control{min-width:150px}
.day-tab.closed{border-color:#dc2626;background:#fff1f2;color:#991b1b}.day-tab.closed small{display:block;font-size:9px;margin-top:3px;max-width:92px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dark .day-tab.closed{background:#3f1118;color:#fecdd3}
.closure-modal-backdrop{position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.68);display:grid;place-items:center;padding:20px}.closure-modal{width:min(680px,100%);max-height:92vh;overflow:auto;background:var(--panel,#fff);color:var(--text,#172033);border-radius:18px;padding:22px;box-shadow:0 28px 80px rgba(0,0,0,.35)}.closure-modal-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.closure-modal-head h2{margin:4px 0 12px}.closure-warning{margin:14px 0;padding:12px;border-radius:10px;background:#fff7ed;border:1px solid #fdba74;color:#9a3412;line-height:1.45}.dark .closure-warning{background:#431407;color:#fed7aa}.closure-confirm{display:flex;gap:10px;align-items:flex-start;font-weight:700}.closure-confirm input{width:auto;margin-top:3px}.closure-modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}.closure-error{margin-top:10px}.closure-reopen-summary{padding:14px;border:1px solid var(--line,#cbd5e1);border-radius:12px}.closure-toast{margin:8px 0;padding:8px 12px;border-radius:10px;background:#ecfdf5;color:#065f46;font-weight:700}
.weekly-closure-summary{border:2px solid #dc2626}.weekly-closure-row{display:grid;grid-template-columns:1fr 1.5fr 1fr 1.5fr;gap:8px;padding:8px 0;border-top:1px solid #fecaca;font-size:11px}
.daily-pdf-v3-closure-page{min-height:1050px}.daily-pdf-v3-closure-card{display:flex;gap:18px;align-items:center;margin:16px 0 20px;padding:24px;border:2px solid #b91c1c;border-radius:16px;background:#fff1f2;color:#7f1d1d}.daily-pdf-v3-closure-card h1{margin:4px 0 8px;font-size:26px}.daily-pdf-v3-closure-icon{font-size:38px}.daily-pdf-v3-closure-note{margin-top:12px;padding:10px 12px;border-radius:9px;background:#fff}.daily-pdf-v3-closure-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.daily-pdf-v3-closure-grid>div{padding:12px;border:1px solid #e2e8f0;border-radius:10px}.daily-pdf-v3-closure-grid span{display:block;font-size:10px;text-transform:uppercase;color:#64748b}.daily-pdf-v3-closure-grid strong{display:block;margin-top:4px}
@media(max-width:760px){.closure-header-actions{align-items:stretch}.weekly-closure-row{grid-template-columns:1fr 1fr}.daily-pdf-v3-closure-grid{grid-template-columns:1fr}}
`

export function dayClosurePlugin() {
  return {
    name: 'staffboard-day-closure', enforce: 'pre',
    transform(code, id) {
      if (id.endsWith('/src/App.jsx')) {
        const next = injectAppUi(injectAppCore(code))
        return next === code ? null : { code: next, map: null }
      }
      if (id.endsWith('/src/reporting.js')) {
        const next = injectReporting(code)
        return next === code ? null : { code: next, map: null }
      }
      if (id.endsWith('/src/DailyPdfReportV3.jsx')) {
        const next = injectDailyPdf(code)
        return next === code ? null : { code: next, map: null }
      }
      if (id.endsWith('/src/App.css') || id.endsWith('/src/DailyPdfReportV3.css')) {
        if (code.includes('.site-closure-banner')) return null
        return { code: `${code}\n${closureCss}`, map: null }
      }
      return null
    },
  }
}

export const __test = {
  injectApp: (code) => injectAppUi(injectAppCore(code)), injectReporting, injectDailyPdf,
}
