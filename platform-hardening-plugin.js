import { assertTransformMarkers, transformDiagnostic } from './platform/transform-safety.js'

const APP_SPEC = {
  id: 'src/App.jsx',
  required: [
    'data-staffboard-shell',
    'data-recovery-panel-route',
    'SITE CLOSED',
    'loadScheduledTransitionStatus',
    'data-day-closure-control',
    'data-day-closure-banner',
    'data-day-closure-modal',
    'data-day-closure-submit',
  ],
  unique: [
    'data-recovery-panel-route',
    'data-recovery-sync-bridge',
    'data-day-closure-control',
    'data-day-closure-banner',
    'data-day-closure-modal',
    'data-day-closure-submit',
  ],
}

export function platformHardeningPlugin() {
  const diagnostics = []
  return {
    name: 'staffboard-platform-hardening',
    enforce: 'post',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      assertTransformMarkers(code, APP_SPEC)
      diagnostics.push(transformDiagnostic(code, APP_SPEC))
      return null
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'transform-diagnostics.json',
        source: JSON.stringify({ generatedAt: new Date().toISOString(), diagnostics }, null, 2),
      })
    },
  }
}

export const __test = { APP_SPEC }
