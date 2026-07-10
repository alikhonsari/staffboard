import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { weekIsolationPlugin } from './week-isolation-plugin.js'
import { clearDayPlugin } from './clear-day-plugin.js'
import { enhancementSuitePlugin } from './enhancement-suite-plugin.js'
import { resetWeekScopePlugin } from './reset-week-scope-plugin.js'
import { shiftScopeCorePlugin } from './shift-scope-core-plugin.js'
import { weekMetadataScopePlugin } from './week-metadata-scope-plugin.js'
import { shiftOpsLogicPlugin } from './shift-ops-logic-plugin.js'
import { shiftOpsSyntaxFixPlugin } from './shift-ops-syntax-fix-plugin.js'
import { crossBoardAuditPlugin } from './cross-board-audit-plugin.js'
import { exportContextPlugin } from './export-context-plugin.js'
import { enhancementNavPlugin } from './enhancement-nav-plugin.js'
import { managerTabPlugin } from './manager-tab-plugin.js'
import { auditTabPlugin } from './audit-tab-plugin.js'
import { toolsTabPlugin } from './tools-tab-plugin.js'
import { suggestionsTabPlugin } from './suggestions-tab-plugin.js'
import { shiftContextUxPlugin } from './shift-context-ux-plugin.js'
import { analysisScopePlugin } from './analysis-scope-plugin.js'
import { auditAdminPlugin } from './audit-admin-plugin.js'
import { auditActionsPlugin } from './audit-actions-plugin.js'
import { shiftCorePlugin } from './shift-core-plugin.js'
import { scheduledStatusPlugin } from './scheduled-status-plugin.js'
import { builderTagPlugin } from './builder-tag-plugin.js'
import { reportExportPlugin } from './report-export-plugin.js'
import { reportShiftFixPlugin } from './report-shift-fix-plugin.js'
import { pdfDailyDataPlugin } from './pdf-daily-data-plugin.js'
import { pdfDailySectionPlugin } from './pdf-daily-section-plugin.js'
import { pdfWeeklyDataPlugin } from './pdf-weekly-data-plugin.js'
import { pdfWeeklySectionPlugin } from './pdf-weekly-section-plugin.js'
import { pdfFooterPlugin } from './pdf-footer-plugin.js'

export default defineConfig({
  plugins: [weekIsolationPlugin(), clearDayPlugin(), enhancementSuitePlugin(), resetWeekScopePlugin(), shiftScopeCorePlugin(), weekMetadataScopePlugin(), shiftOpsLogicPlugin(), shiftOpsSyntaxFixPlugin(), crossBoardAuditPlugin(), exportContextPlugin(), enhancementNavPlugin(), managerTabPlugin(), auditTabPlugin(), toolsTabPlugin(), suggestionsTabPlugin(), shiftContextUxPlugin(), analysisScopePlugin(), auditAdminPlugin(), auditActionsPlugin(), shiftCorePlugin(), reportExportPlugin(), reportShiftFixPlugin(), pdfDailyDataPlugin(), pdfWeeklyDataPlugin(), pdfDailySectionPlugin(), pdfWeeklySectionPlugin(), pdfFooterPlugin(), builderTagPlugin(), scheduledStatusPlugin(), react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['squid-app-wrvn7.ondigitalocean.app', '.ondigitalocean.app', 'cloud-fronted.com'],
  },
})
