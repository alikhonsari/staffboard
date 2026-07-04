export function builderTagPlugin() {
  return {
    name: 'staffboard-builder-tags',
    enforce: 'pre',
    transform(code, id) {
      let next = code

      if (id.endsWith('/src/App.jsx')) {
        next = next.replace(
          "    trainedClampTruck: false,\n    isTrainer: false,",
          "    trainedClampTruck: false,\n    trainedRackMover: false,\n    trainedReachTruck: false,\n    isTrainer: false,"
        )

        next = next.replace(
          "    trainedClampTruck: false,\n    isTrainer: false,",
          "    trainedClampTruck: false,\n    trainedRackMover: false,\n    trainedReachTruck: false,\n    isTrainer: false,"
        )

        next = next.replace(
          "  if (builder.trainedClampTruck) flags.push('Clamp Truck')\n  if (builder.isTrainer) flags.push('Trainer')",
          "  if (builder.trainedClampTruck) flags.push('Clamp Truck')\n  if (builder.trainedRackMover) flags.push('Rack Mover')\n  if (builder.trainedReachTruck) flags.push('Reach Truck')\n  if (builder.isTrainer) flags.push('Trainer')"
        )

        next = next.replace(
          "      trainedClampTruck: header.indexOf('trainedclamptruck'),\n      isTrainer: header.indexOf('istrainer'),",
          "      trainedClampTruck: header.indexOf('trainedclamptruck'),\n      trainedRackMover: header.indexOf('trainedrackmover'),\n      trainedReachTruck: header.indexOf('trainedreachtruck'),\n      isTrainer: header.indexOf('istrainer'),"
        )

        next = next.replace(
          "          trainedClampTruck: idx.trainedClampTruck >= 0 ? toBool(r[idx.trainedClampTruck]) : false,\n          isTrainer: idx.isTrainer >= 0 ? toBool(r[idx.isTrainer]) : false,",
          "          trainedClampTruck: idx.trainedClampTruck >= 0 ? toBool(r[idx.trainedClampTruck]) : false,\n          trainedRackMover: idx.trainedRackMover >= 0 ? toBool(r[idx.trainedRackMover]) : false,\n          trainedReachTruck: idx.trainedReachTruck >= 0 ? toBool(r[idx.trainedReachTruck]) : false,\n          isTrainer: idx.isTrainer >= 0 ? toBool(r[idx.isTrainer]) : false,"
        )

        next = next.replace(
          "toCSV([['name','badgeType','trainedTdr','trainedForklift','trainedCenterRider','trainedClampTruck','isTrainer','isSafetyMember','isLineLead'], ...state.builderPool.map((b) => [b.name, b.badgeType || 'day', b.trainedTdr, b.trainedForklift, b.trainedCenterRider, b.trainedClampTruck, b.isTrainer, b.isSafetyMember, b.isLineLead])])",
          "toCSV([['name','badgeType','trainedTdr','trainedForklift','trainedCenterRider','trainedClampTruck','trainedRackMover','trainedReachTruck','isTrainer','isSafetyMember','isLineLead'], ...state.builderPool.map((b) => [b.name, b.badgeType || 'day', b.trainedTdr, b.trainedForklift, b.trainedCenterRider, b.trainedClampTruck, b.trainedRackMover, b.trainedReachTruck, b.isTrainer, b.isSafetyMember, b.isLineLead])])"
        )

        next = next.replace(
          "                    <label className=\"check-pill\"><input type=\"checkbox\" checked={!!selectedPoolBuilder.trainedClampTruck} onChange={(e) => updatePoolBuilder(selectedPoolBuilderId, { trainedClampTruck: e.target.checked })} />Clamp Truck</label>\n                    <label className=\"check-pill\"><input type=\"checkbox\" checked={!!selectedPoolBuilder.isTrainer}",
          "                    <label className=\"check-pill\"><input type=\"checkbox\" checked={!!selectedPoolBuilder.trainedClampTruck} onChange={(e) => updatePoolBuilder(selectedPoolBuilderId, { trainedClampTruck: e.target.checked })} />Clamp Truck</label>\n                    <label className=\"check-pill\"><input type=\"checkbox\" checked={!!selectedPoolBuilder.trainedRackMover} onChange={(e) => updatePoolBuilder(selectedPoolBuilderId, { trainedRackMover: e.target.checked })} />Rack Mover</label>\n                    <label className=\"check-pill\"><input type=\"checkbox\" checked={!!selectedPoolBuilder.trainedReachTruck} onChange={(e) => updatePoolBuilder(selectedPoolBuilderId, { trainedReachTruck: e.target.checked })} />Reach Truck</label>\n                  </div>\n                  <div className=\"row three\">\n                    <label className=\"check-pill\"><input type=\"checkbox\" checked={!!selectedPoolBuilder.isTrainer}"
        )
      }

      if (id.endsWith('/src/reporting.js')) {
        next = next.replace(
          "profile.trainedClampTruck ? 'Clamp Truck' : '', profile.isTrainer ? 'Trainer' : ''",
          "profile.trainedClampTruck ? 'Clamp Truck' : '', profile.trainedRackMover ? 'Rack Mover' : '', profile.trainedReachTruck ? 'Reach Truck' : '', profile.isTrainer ? 'Trainer' : ''"
        )
      }

      return next === code ? null : { code: next, map: null }
    },
  }
}
