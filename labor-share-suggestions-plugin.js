export function laborShareSuggestionsPlugin() {
  return {
    name: 'staffboard-labor-share-suggestions',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code

      next = next.replace(
        '    return suggestions.slice(0, 10)',
        `    laborShareBuilders.forEach((builder) => {
      const assignment = getAssignment(builder.id)
      const profile = normalizeBuilderProfile(state.builderPool.find((item) => item.id === builder.id) || builder)
      suggestions.push({
        title: builder.name + ' is labor shared to ' + (assignment.area || 'Labor Share'),
        reason: builder.name + (profile.isLineLead ? ' is a line lead and' : '') + ' remains in Total Shift HC but is excluded from SPEED Production HC and the SPEED TPH denominator.',
      })
    })
    const productionGaps = areaCounts.filter((area) => area.areaType === 'production' && Number(area.capacity || 0) > 0 && area.count < Number(area.capacity || 0))
    if (isSpeedBoard && laborShareBuilders.length > 0 && productionGaps.length > 0) {
      const largestGap = [...productionGaps].sort((a, b) => (Number(b.capacity || 0) - b.count) - (Number(a.capacity || 0) - a.count))[0]
      suggestions.unshift({
        title: largestGap.name + ' is short ' + (Number(largestGap.capacity || 0) - largestGap.count) + ' while ' + laborShareBuilders.length + ' builder(s) are labor shared',
        reason: 'Review labor-share priorities before returning anyone. Returning one eligible builder would increase SPEED Production HC from ' + speedProductionHeadcount + ' to ' + (speedProductionHeadcount + 1) + '.',
      })
    }
    return suggestions.slice(0, 14)`
      )

      return next === code ? null : { code: next, map: null }
    },
  }
}
