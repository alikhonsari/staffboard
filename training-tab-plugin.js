const REPORTING_IMPORT = "import { exportEndOfShiftExcel, exportWeeklyExcel } from './reporting'"
const TRAINING_IMPORT = "import TrainingTab from './TrainingTab.jsx'"
const COMMENTS_BUTTON = "          <button className={mainTab === 'comments' ? 'primary nav-tab active' : 'secondary nav-tab'} onClick={() => setMainTab('comments')}>Comments</button>"
const COMMENTS_PANEL = "        ) : mainTab === 'comments' ? ("

export function injectTrainingTab(source) {
  if (source.includes(TRAINING_IMPORT)) return source
  if (!source.includes(REPORTING_IMPORT)) throw new Error('Training tab transform could not locate the reporting import.')
  if (!source.includes(COMMENTS_BUTTON)) throw new Error('Training tab transform could not locate the Comments navigation button.')
  if (!source.includes(COMMENTS_PANEL)) throw new Error('Training tab transform could not locate the Comments panel anchor.')

  let output = source.replace(REPORTING_IMPORT, `${REPORTING_IMPORT}\n${TRAINING_IMPORT}`)
  output = output.replace(
    COMMENTS_BUTTON,
    `          <button className={mainTab === 'training' ? 'primary nav-tab active' : 'secondary nav-tab'} onClick={() => setMainTab('training')}>Training</button>\n${COMMENTS_BUTTON}`,
  )
  output = output.replace(
    COMMENTS_PANEL,
    `        ) : mainTab === 'training' ? (\n          <TrainingTab builders={state.builderPool || []} currentUser={state.adminName || ''} currentShift={state.boardShift || ''} />\n${COMMENTS_PANEL}`,
  )
  return output
}

export function trainingTabPlugin() {
  return {
    name: 'staffboard-training-tab',
    enforce: 'pre',
    transform(source, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      return { code: injectTrainingTab(source), map: null }
    },
  }
}
