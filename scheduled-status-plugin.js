export function scheduledStatusPlugin() {
  return {
    name: 'staffboard-scheduled-status',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null

      let next = code
      const importLine = "import { applyScheduledStatuses } from './scheduledStatusRuntime.js'\n"
      if (!next.includes("./scheduledStatusRuntime.js")) next = importLine + next

      const marker = "  useEffect(() => {\n    const t = setInterval(() => setTick(Date.now()), 60000)"
      if (!next.includes('const runScheduledStatuses = () =>')) {
        const effect = `  useEffect(() => {\n    const runScheduledStatuses = () => {\n      setState((prev) => applyScheduledStatuses(prev, new Date()))\n    }\n    runScheduledStatuses()\n    const scheduledTimer = setInterval(runScheduledStatuses, 15000)\n    return () => clearInterval(scheduledTimer)\n  }, [])\n\n`
        next = next.replace(marker, effect + marker)
      }

      return next === code ? null : { code: next, map: null }
    },
  }
}
