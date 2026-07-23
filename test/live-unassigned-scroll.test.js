import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { injectLiveUnassignedScroll } from '../live-unassigned-scroll-plugin.js'

const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const cssSource = fs.readFileSync(new URL('../src/live-unassigned-scroll.css', import.meta.url), 'utf8')
const mainSource = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
const viteSource = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')

test('only the live Unassigned area receives scroll classes', () => {
  const output = injectLiveUnassignedScroll(appSource)
  assert.match(output, /area\.name === "Unassigned" \? "live-unassigned-scroll" : ""/)
  assert.match(output, /area\.name === "Unassigned" \? "live-unassigned-scroll-body" : ""/)
  assert.doesNotMatch(output, /area\.name !== "Unassigned"/)
})

test('Unassigned scroll styling is isolated in an additive stylesheet', () => {
  assert.match(cssSource, /\.live-unassigned-scroll\s*\{/)
  assert.match(cssSource, /max-height:\s*680px/)
  assert.match(cssSource, /\.live-unassigned-scroll-body\s*\{/)
  assert.match(cssSource, /overflow-y:\s*auto/)
  assert.match(cssSource, /overscroll-behavior:\s*contain/)
  assert.match(cssSource, /position:\s*sticky/)
  assert.match(mainSource, /import '\.\/live-unassigned-scroll\.css'/)
})

test('Vite loads the Unassigned scroll transform', () => {
  assert.match(viteSource, /liveUnassignedScrollPlugin/)
  assert.match(viteSource, /liveUnassignedScrollPlugin\(\)/)
})
