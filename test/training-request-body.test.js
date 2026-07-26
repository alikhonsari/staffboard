import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import express from 'express'
import { installTrainingRoutes } from '../training-routes.js'

test('Training matrix import parses JSON even when routes are installed before the app parser', async (t) => {
  const app = express()

  // Deliberately do not mount app.use(express.json()). The guarded production
  // runtime installs Training routes before server.js registers its global parser.
  installTrainingRoutes(app, { authSecret: 'test-secret', authToken: 'test-token' })

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve) => server.close(resolve)))

  const address = server.address()
  assert.ok(address && typeof address === 'object')

  const response = await fetch(`http://127.0.0.1:${address.port}/api/training/import-matrix`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ csvText: 'Builder,OB1\n' }),
  })

  assert.equal(response.status, 400)
  const payload = await response.json()

  // This parser-level validation proves req.body.csvText reached the route.
  assert.match(payload.error, /must contain a header and at least one builder row/i)
  assert.doesNotMatch(payload.error, /A Training matrix CSV is required/i)
})
