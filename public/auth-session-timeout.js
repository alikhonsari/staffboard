(() => {
  // Disabled: do not fake /api/me and do not clear tokens.
  // The real server /api/me route now handles session checks safely.
  window.__STAFFBOARD_AUTH_TIMEOUT_DISABLED__ = true
})()
