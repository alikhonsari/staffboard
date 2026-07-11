export function builderManagementInsightsPlugin() {
  return {
    name: 'staffboard-builder-management-insights',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code

      if (!next.includes("./BuilderHealthInsights.jsx")) {
        const marker = "import BuilderManagementWorkspace, { DEFAULT_BUILDER_SKILLS } from './BuilderManagementWorkspace.jsx'"
        next = next.replace(marker, `${marker}\nimport BuilderHealthInsights from './BuilderHealthInsights.jsx'`)
      }

      if (!next.includes('mode="manager"')) {
        const managerMarker = '          <div className="summary-card-block card labor-share-detail-card">'
        next = next.replace(managerMarker, `          <BuilderHealthInsights state={state} dayState={dayState} mode="manager" />\n\n${managerMarker}`)
      }

      if (!next.includes('mode="suggestions"')) {
        const suggestionsTitle = next.indexOf('Smart Staffing Suggestions')
        if (suggestionsTitle >= 0) {
          const layoutMarker = '          <div className="two-col-layout">'
          const layoutIndex = next.indexOf(layoutMarker, suggestionsTitle)
          if (layoutIndex >= 0) {
            next = next.slice(0, layoutIndex) + '          <BuilderHealthInsights state={state} dayState={dayState} mode="suggestions" />\n\n' + next.slice(layoutIndex)
          }
        }
      }

      return next === code ? null : { code: next, map: null }
    },
  }
}
