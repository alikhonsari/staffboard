export function laborShareMovementPlugin() {
  return {
    name: 'staffboard-labor-share-movement',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code

      next = next.replace(
        `      const nextStatus = nextAssignment.status || 'Present'
      const nextArea = nextAssignment.area || 'Unassigned'

      let movementLog`,
        `      const nextStatus = nextAssignment.status || 'Present'
      const nextArea = nextAssignment.area || 'Unassigned'
      const currentAreaType = areaTypeFor(currentArea)
      const nextAreaType = areaTypeFor(nextArea)
      if (patch.area !== undefined && currentAreaType === 'production' && nextAreaType === 'labor_share') {
        nextAssignment.previousProductionArea = currentArea
      } else if (!nextAssignment.previousProductionArea) {
        nextAssignment.previousProductionArea = currentAssignment.previousProductionArea || ''
      }

      let movementLog`
      )

      next = next.replace(
        `        movementLog.unshift({
          timestamp,
          builder: builder.name,
          from: \`${'${currentArea}'} / ${'${currentStatus}'}\`,
          to: \`${'${nextArea}'} / ${'${nextStatus}'}\`,
          note: \`Area changed from ${'${currentArea}'} to ${'${nextArea}'}\`,
        })`,
        `        movementLog.unshift({
          timestamp,
          admin: user?.username || state.adminName || 'System',
          builder: builder.name,
          action: laborShareActionFor(builderId, currentArea, nextArea),
          from: \`${'${currentArea}'} / ${'${currentStatus}'}\`,
          to: \`${'${nextArea}'} / ${'${nextStatus}'}\`,
          fromArea: currentArea,
          toArea: nextArea,
          fromAreaType: currentAreaType,
          toAreaType: nextAreaType,
          previousProductionArea: nextAssignment.previousProductionArea || '',
          note: \`Area changed from ${'${currentArea}'} to ${'${nextArea}'}\`,
        })`
      )

      next = next.replace(
        `        movementLog.unshift({
          timestamp,
          builder: builder.name,
          from: \`${'${nextArea}'} / ${'${currentStatus}'}\`,
          to: \`${'${nextArea}'} / ${'${nextStatus}'}\`,
          note: \`Status changed from ${'${currentStatus}'} to ${'${nextStatus}'}\`,
        })`,
        `        movementLog.unshift({
          timestamp,
          admin: user?.username || state.adminName || 'System',
          builder: builder.name,
          action: nextAreaType === 'labor_share' ? 'Labor Share Status Changed' : 'Status Changed',
          from: \`${'${nextArea}'} / ${'${currentStatus}'}\`,
          to: \`${'${nextArea}'} / ${'${nextStatus}'}\`,
          fromArea: nextArea,
          toArea: nextArea,
          fromAreaType: nextAreaType,
          toAreaType: nextAreaType,
          previousProductionArea: nextAssignment.previousProductionArea || '',
          note: \`Status changed from ${'${currentStatus}'} to ${'${nextStatus}'}\`,
        })`
      )

      return next === code ? null : { code: next, map: null }
    },
  }
}
