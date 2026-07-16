const LEGACY_DEFAULT_CONFIG = `  storageConfig: {
    mode: 'spaces-auto',
    s3Bucket: '',
    s3Region: '',
    s3KeyPrefix: 'staffing-board/',
  },`

const POSTGRES_DEFAULT_CONFIG = `  storageConfig: {
    mode: 'postgres',
    backend: 'postgres',
  },`

const LEGACY_NORMALIZE = `  state.storageConfig = { ...defaultState.storageConfig, ...(saved?.storageConfig || {}) }`
const POSTGRES_NORMALIZE = `  state.storageConfig = { mode: 'postgres', backend: 'postgres' }`

const LEGACY_SAVE_ERROR = `      } catch {
        setSyncStatus('Save pending')
      }`
const POSTGRES_SAVE_ERROR = `      } catch (error) {
        const message = error?.message || 'Unknown save error'
        setSyncStatus('Save failed: ' + message)
      }`

export function hardenPostgresStateClient(source) {
  let next = source
  if (next.includes(LEGACY_DEFAULT_CONFIG)) next = next.replace(LEGACY_DEFAULT_CONFIG, POSTGRES_DEFAULT_CONFIG)
  if (next.includes(LEGACY_NORMALIZE)) next = next.replace(LEGACY_NORMALIZE, POSTGRES_NORMALIZE)
  if (next.includes(LEGACY_SAVE_ERROR)) next = next.replace(LEGACY_SAVE_ERROR, POSTGRES_SAVE_ERROR)

  next = next
    .replaceAll('Server env missing', 'PostgreSQL connected')
    .replaceAll('Server environment missing', 'PostgreSQL connected')

  if (!next.includes("mode: 'postgres'")) throw new Error('PostgreSQL state client could not replace legacy storage configuration.')
  if (!next.includes("setSyncStatus('Save failed: ' + message)")) throw new Error('PostgreSQL state client could not install detailed save errors.')
  return next
}

export function postgresStateSavePlugin() {
  return {
    name: 'postgres-state-save-hardening',
    enforce: 'pre',
    transform(source, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      return { code: hardenPostgresStateClient(source), map: null }
    },
  }
}
