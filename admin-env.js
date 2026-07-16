const clean = (value) => String(value ?? '').trim()

function stripWrappingQuotes(value) {
  const text = clean(value)
  if (text.length >= 2) {
    const first = text[0]
    const last = text[text.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) return text.slice(1, -1).trim()
  }
  return text
}

function normalizeAdmin(admin) {
  const username = clean(admin?.username)
  const password = clean(admin?.password)
  const role = clean(admin?.role) || 'admin'
  return username && password ? { username, password, role } : null
}

function parseJsonAdmins(env, warnings) {
  const raw = env.ADMINS_JSON || env.STAFFBOARD_ADMINS_JSON || ''
  if (!clean(raw)) return []
  try {
    const parsed = JSON.parse(stripWrappingQuotes(raw))
    if (!Array.isArray(parsed)) throw new Error('admin JSON must be an array')
    return parsed.map(normalizeAdmin).filter(Boolean)
  } catch (error) {
    warnings.push(`Invalid ADMINS_JSON / STAFFBOARD_ADMINS_JSON: ${error.message}`)
    return []
  }
}

function parseNumberedAdmins(env, warnings) {
  const indexes = new Set()
  for (const key of Object.keys(env)) {
    const match = key.match(/^STAFFBOARD_ADMIN_(\d+)_(USER|PASS|ROLE)$/)
    if (match) indexes.add(Number(match[1]))
  }

  const admins = []
  for (const index of [...indexes].sort((a, b) => a - b)) {
    const username = clean(env[`STAFFBOARD_ADMIN_${index}_USER`])
    const password = clean(env[`STAFFBOARD_ADMIN_${index}_PASS`])
    const role = clean(env[`STAFFBOARD_ADMIN_${index}_ROLE`]) || 'admin'
    if (!username && !password) continue
    if (!username || !password) {
      warnings.push(`Incomplete numbered admin ${index}: both USER and PASS are required`)
      continue
    }
    admins.push({ username, password, role })
  }
  return admins
}

function parseSingleAdmin(env) {
  const username = clean(env.STAFFBOARD_ADMIN_USER || env.ADMIN_USER)
  const password = clean(env.STAFFBOARD_ADMIN_PASS || env.ADMIN_PASS)
  return username && password ? [{ username, password, role: 'admin' }] : []
}

export function loadAdmins(env = process.env, authToken = '') {
  const warnings = []
  const admins = [
    ...parseJsonAdmins(env, warnings),
    ...parseNumberedAdmins(env, warnings),
    ...parseSingleAdmin(env),
  ]

  if (clean(authToken)) admins.push({ username: 'ali', password: clean(authToken), role: 'admin' })

  const deduped = []
  const seen = new Set()
  for (const admin of admins) {
    const key = admin.username.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(admin)
  }

  return { admins: deduped, warnings }
}
