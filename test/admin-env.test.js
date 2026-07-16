import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAdmins } from '../admin-env.js'

test('loads numbered admin USER and PASS pairs in numeric order', () => {
  const { admins, warnings } = loadAdmins({
    STAFFBOARD_ADMIN_10_USER: 'mia',
    STAFFBOARD_ADMIN_10_PASS: 'ten-pass',
    STAFFBOARD_ADMIN_2_USER: 'uj',
    STAFFBOARD_ADMIN_2_PASS: 'two-pass',
    STAFFBOARD_ADMIN_1_USER: 'ali',
    STAFFBOARD_ADMIN_1_PASS: 'one-pass',
  })

  assert.deepEqual(admins.map((admin) => admin.username), ['ali', 'uj', 'mia'])
  assert.equal(admins[0].password, 'one-pass')
  assert.deepEqual(warnings, [])
})

test('ignores incomplete numbered pairs and returns a precise warning', () => {
  const { admins, warnings } = loadAdmins({
    STAFFBOARD_ADMIN_1_USER: 'ali',
    STAFFBOARD_ADMIN_1_PASS: 'secret',
    STAFFBOARD_ADMIN_2_USER: 'uj',
  })

  assert.deepEqual(admins.map((admin) => admin.username), ['ali'])
  assert.match(warnings[0], /Incomplete numbered admin 2/)
})

test('accepts JSON wrapped in platform-added single quotes', () => {
  const { admins, warnings } = loadAdmins({
    ADMINS_JSON: `'[{"username":"ali","password":"secret","role":"admin"}]'`,
  })

  assert.equal(admins.length, 1)
  assert.equal(admins[0].username, 'ali')
  assert.deepEqual(warnings, [])
})

test('deduplicates usernames across JSON, numbered, and single-admin fallbacks', () => {
  const { admins } = loadAdmins({
    ADMINS_JSON: '[{"username":"ali","password":"json-pass"}]',
    STAFFBOARD_ADMIN_1_USER: 'ALI',
    STAFFBOARD_ADMIN_1_PASS: 'numbered-pass',
    STAFFBOARD_ADMIN_USER: 'ali',
    STAFFBOARD_ADMIN_PASS: 'single-pass',
  })

  assert.equal(admins.length, 1)
  assert.equal(admins[0].password, 'json-pass')
})
