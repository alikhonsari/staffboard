const INSERT_AFTER_KEYS = `const LOGIN_USER_KEY = 'staffboard2_user'`
const INSERT_AFTER_QUEUE = `let saveQueue = Promise.resolve()`

function requireReplace(source, target, replacement, label) {
  if (!source.includes(target)) throw new Error(`Local navigation/save-state transform could not locate ${label}.`)
  return source.replace(target, replacement)
}

export function injectLocalNavigationSaveState(source) {
  if (source.includes("const LOCAL_SELECTED_DAY_KEY = 'staffboard_local_selected_day'")) return source

  let next = requireReplace(
    source,
    INSERT_AFTER_KEYS,
    `${INSERT_AFTER_KEYS}\nconst LOCAL_SELECTED_DAY_KEY = 'staffboard_local_selected_day'`,
    'login storage keys',
  )

  next = requireReplace(
    next,
    INSERT_AFTER_QUEUE,
    `${INSERT_AFTER_QUEUE}\nlet pendingSaveCount = 0`,
    'save queue declaration',
  )

  next = requireReplace(
    next,
    `  merged.stateRevision = Number(saved.stateRevision || 0)\n  return merged`,
    `  merged.stateRevision = Number(saved.stateRevision || 0)\n  try {\n    const localSelectedDay = sessionStorage.getItem(LOCAL_SELECTED_DAY_KEY)\n    if (localSelectedDay) merged.selectedDay = localSelectedDay\n  } catch {}\n  return merged`,
    'state normalization return',
  )

  next = requireReplace(
    next,
    `export function saveState(state) {\n  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))\n}`,
    `export function saveState(state) {\n  try {\n    if (state?.selectedDay) sessionStorage.setItem(LOCAL_SELECTED_DAY_KEY, String(state.selectedDay))\n  } catch {}\n  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))\n}`,
    'local state save',
  )

  next = requireReplace(
    next,
    `  const stateJson = JSON.stringify(state)\n  if (stateJson === lastRemoteStateJson) return { skipped: true, reason: 'unchanged' }`,
    `  const remoteState = { ...state }\n  const activeSelectedDay = String(state?.selectedDay || '')\n  delete remoteState.selectedDay\n  const stateJson = JSON.stringify(remoteState)\n  const comparableLastRemote = (() => {\n    try {\n      const parsed = JSON.parse(lastRemoteStateJson || '{}')\n      delete parsed.selectedDay\n      return JSON.stringify(parsed)\n    } catch {\n      return lastRemoteStateJson\n    }\n  })()\n  if (stateJson === comparableLastRemote) return { skipped: true, reason: 'unchanged' }`,
    'remote state comparison',
  )

  next = requireReplace(
    next,
    `      state,\n      baseUpdatedAt: remoteUpdatedAt ?? '',`,
    `      state: remoteState,\n      viewContext: {\n        boardId: String(state?.currentBoardId || ''),\n        weekStartDate: String(state?.weekStartDate || ''),\n        day: activeSelectedDay,\n      },\n      baseUpdatedAt: remoteUpdatedAt ?? '',`,
    'remote save body',
  )

  next = requireReplace(
    next,
    `export function saveRemoteState(state) {\n  const job = saveQueue.catch(() => {}).then(() => performRemoteSave(state))\n  saveQueue = job\n  return job\n}`,
    `export function saveRemoteState(state) {\n  pendingSaveCount += 1\n  const job = saveQueue.catch(() => {}).then(() => performRemoteSave(state))\n  saveQueue = job.finally(() => {\n    pendingSaveCount = Math.max(0, pendingSaveCount - 1)\n  })\n  return saveQueue\n}`,
    'remote save queue',
  )

  next = requireReplace(
    next,
    `    saveQueued: Boolean(saveQueue),`,
    `    saveQueued: pendingSaveCount > 0,`,
    'storage diagnostics pending flag',
  )

  return next
}

export function localNavigationSaveStatePlugin() {
  return {
    name: 'local-navigation-save-state',
    enforce: 'pre',
    transform(source, id) {
      if (!id.endsWith('/src/storageAdapter.js')) return null
      return { code: injectLocalNavigationSaveState(source), map: null }
    },
  }
}
