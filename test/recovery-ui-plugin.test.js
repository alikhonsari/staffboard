import test from 'node:test'
import assert from 'node:assert/strict'
import { recoveryUiPlugin } from '../recovery-ui-plugin.js'

test('Recovery UI plugin adds navigation and the routed panel without duplicating it', () => {
  const source = `
import React from 'react'
function StaffBoardApp(){
  return (
    <div>
          <button className={mainTab === 'comments' ? 'primary nav-tab active' : 'secondary nav-tab'} onClick={() => setMainTab('comments')}>Comments</button>
            <button className={mainTab === 'comments' ? 'primary sidebar-tab active' : 'secondary sidebar-tab'} onClick={() => setMainTab('comments')}>Comments</button>
        {mainTab === 'board' ? (
          <div>Board</div>
        ) : mainTab === 'comments' ? (
          <div>Comments</div>
        ) : null}
    </div>
  )
}`
  const plugin = recoveryUiPlugin()
  const first = plugin.transform(source, '/workspace/src/App.jsx').code
  assert.match(first, /import RecoveryPanel from '\.\/RecoveryPanel\.jsx'/)
  assert.match(first, /mainTab === 'recovery'/)
  assert.match(first, /data-recovery-panel-route="true"/)
  assert.match(first, /normalizeState=\{normalizeState\}/)

  const secondResult = plugin.transform(first, '/workspace/src/App.jsx')
  const second = secondResult?.code || first
  assert.equal((second.match(/data-recovery-panel-route="true"/g) || []).length, 1)
  assert.equal((second.match(/import RecoveryPanel/g) || []).length, 1)
})

test('Recovery UI plugin ignores unrelated files', () => {
  const plugin = recoveryUiPlugin()
  assert.equal(plugin.transform('export const x = 1', '/workspace/src/other.js'), null)
})
