const AREA_CLASS = 'className={`area ${people.length > 0 ? "area-active" : "area-idle"}`}'
const BODY_CLASS = '<div className="area-body">'
const BODY_REPLACEMENT = '<div className={`area-body ${area.name === "Unassigned" ? "live-unassigned-scroll-body" : ""}`}>'

export function injectLiveUnassignedScroll(source) {
  if (source.includes('live-unassigned-scroll')) return source
  if (!source.includes(AREA_CLASS)) throw new Error('Live Unassigned scroll transform could not locate area card class.')

  let output = source.replace(
    AREA_CLASS,
    'className={`area ${people.length > 0 ? "area-active" : "area-idle"} ${area.name === "Unassigned" ? "live-unassigned-scroll" : ""}`}',
  )

  const areaMapIndex = output.indexOf('{effectiveAreaDefs.map((area) => {')
  const bodyIndex = output.indexOf(BODY_CLASS, areaMapIndex)
  if (areaMapIndex < 0 || bodyIndex < 0) throw new Error('Live Unassigned scroll transform could not locate area body.')

  output = output.slice(0, bodyIndex) + BODY_REPLACEMENT + output.slice(bodyIndex + BODY_CLASS.length)
  return output
}

export function liveUnassignedScrollPlugin() {
  return {
    name: 'live-unassigned-scroll',
    enforce: 'pre',
    transform(source, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      return { code: injectLiveUnassignedScroll(source), map: null }
    },
  }
}
