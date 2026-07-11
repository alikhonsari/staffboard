import React, { useEffect, useRef, useState } from 'react'
import { loadRemoteState } from './storageAdapter'
import { loadRecoveryStatus } from './recoveryClient'

export default function RecoverySyncBridge({ defaultState, normalizeState, setState, setSyncStatus }) {
  const revisionRef = useRef(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let stopped = false
    let polling = false

    const poll = async () => {
      if (stopped || polling) return
      polling = true
      try {
        const status = await loadRecoveryStatus()
        const revision = Number(status.recoveryRevision || 0)
        if (revisionRef.current == null) {
          revisionRef.current = revision
        } else if (revision !== revisionRef.current) {
          const remote = await loadRemoteState(defaultState)
          if (stopped) return
          setState((previous) => normalizeState({ ...previous, ...remote }))
          revisionRef.current = revision
          setSyncStatus?.('Synced')
          const latest = status.notifications?.[0]
          if (latest?.message) setNotice(latest.message)
        }
      } catch {
        // Normal shared-state conflict handling remains the fallback if polling is temporarily unavailable.
      } finally {
        polling = false
      }
    }

    poll()
    const timer = setInterval(poll, 2500)
    const onFocus = () => poll()
    const onVisibility = () => { if (document.visibilityState === 'visible') poll() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stopped = true
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [defaultState, normalizeState, setState, setSyncStatus])

  return <div className="sr-only" aria-live="polite" aria-atomic="true">{notice}</div>
}
