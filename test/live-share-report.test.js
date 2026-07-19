import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { injectLiveShareState } from '../live-share-state-plugin.js'

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const exporter = fs.readFileSync(new URL('../public/share-png-live.js', import.meta.url), 'utf8')
const loader = fs.readFileSync(new URL('../public/share-png-float.js', import.meta.url), 'utf8')
const vite = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')

test('React exposes the exact live board state for share exports', () => {
  const transformed = injectLiveShareState(app)
  assert.match(transformed, /window\.__STAFFBOARD_SHARE_STATE__ = state/)
  assert.match(transformed, /selectedDay: state\.selectedDay/)
  assert.match(transformed, /\}, \[state\]\)/)
})

test('Share PNG uses live state instead of compact localStorage', () => {
  assert.match(exporter, /window\.__STAFFBOARD_SHARE_STATE__/)
  assert.doesNotMatch(exporter, /localStorage\.getItem/)
  assert.match(exporter, /weeklyData\?\.\[dayName\(state\)\]/)
  assert.match(exporter, /staffing-board-share-\$\{dayName\(state\)\.toLowerCase\(\)\}/)
})

test('floating Share PNG button loads the live exporter', () => {
  assert.match(loader, /share-png-live\.js\?v=3/)
  assert.doesNotMatch(loader, /share-png-safe\.js/)
  assert.match(vite, /liveShareStatePlugin\(\)/)
})
