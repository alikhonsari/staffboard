import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { injectStartupHydration } from '../startup-hydration-plugin.js'
import { injectMutationAwareTimeouts } from '../request-timeout-plugin.js'

const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const storageSource = fs.readFileSync(new URL('../src/storageAdapter.js', import.meta.url), 'utf8')
const viteSource = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')

function transformedApp() {
  return injectStartupHydration(appSource)
}

test('startup retries PostgreSQL hydration automatically and replaces compact cache state', () => {
  const output = transformedApp()
  assert.match(output, /const \[remoteHydrationReady, setRemoteHydrationReady\] = useState\(false\)/)
  assert.match(output, /setState\(\(\) => normalizeState\(remote\)\)/)
  assert.match(output, /setTimeout\(hydrateFromPostgres, delayMs\)/)
  assert.match(output, /Retrying automatically/)
  assert.doesNotMatch(output, /setState\(\(prev\) => normalizeState\(\{ \.\.\.prev, \.\.\.remote \}\)\)/)
})

test('autosave cannot run before authoritative PostgreSQL hydration completes', () => {
  const output = transformedApp()
  assert.match(output, /if \(!remoteHydrationReady\) return undefined/)
  assert.match(output, /\[state, remoteHydrationReady\]/)
  const hydrationIndex = output.indexOf('setRemoteHydrationReady(true)')
  const saveGuardIndex = output.indexOf('if (!remoteHydrationReady) return undefined')
  assert.ok(hydrationIndex >= 0)
  assert.ok(saveGuardIndex > hydrationIndex)
})

test('state reads allow enough time for the restored large PostgreSQL document', () => {
  const output = injectMutationAwareTimeouts(storageSource)
  assert.match(output, /READ_REQUEST_TIMEOUT_MS = 55000/)
  assert.match(output, /MUTATION_REQUEST_TIMEOUT_MS = 60000/)
  assert.match(output, /still loading the saved PostgreSQL data/)
})

test('startup hydration, live-state sharing, Unassigned scrolling, and save hardening run before later App transforms', () => {
  assert.match(viteSource, /startupHydrationPlugin/)
  assert.match(viteSource, /liveShareStatePlugin/)
  assert.match(viteSource, /liveUnassignedScrollPlugin/)
  assert.match(viteSource, /requestTimeoutPlugin\(\), startupHydrationPlugin\(\), liveShareStatePlugin\(\), liveUnassignedScrollPlugin\(\), postgresStateSavePlugin\(\)/)
})

test('startup hydration transform is idempotent', () => {
  const once = transformedApp()
  assert.equal(injectStartupHydration(once), once)
})
