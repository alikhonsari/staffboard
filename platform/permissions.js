import { errors } from './errors.js'

export const ROLE_PERMISSIONS = Object.freeze({
  'read only': new Set(['board:view', 'audit:view', 'report:export', 'recovery:view']),
  line_lead: new Set(['board:view', 'board:edit', 'schedule:manage', 'audit:view', 'report:export', 'recovery:view']),
  admin: new Set(['*']),
  manager: new Set(['*']),
  system: new Set(['*']),
})

export function normalizeRole(role) {
  const value = String(role || 'admin').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (value === 'readonly') return 'read_only'
  return value
}

export function permissionsForRole(role) {
  const normalized = normalizeRole(role)
  if (normalized === 'read_only') return ROLE_PERMISSIONS['read only']
  return ROLE_PERMISSIONS[normalized] || new Set()
}

export function hasPermission(user, permission) {
  const permissions = permissionsForRole(user?.role)
  return permissions.has('*') || permissions.has(permission)
}

export function requirePermission(permission) {
  return function permissionMiddleware(req, res, next) {
    if (hasPermission(req.user, permission)) return next()
    return next(errors.forbidden(permission))
  }
}

export const PERMISSION_MATRIX = Object.freeze({
  'board:view': ['read_only', 'line_lead', 'admin', 'manager', 'system'],
  'board:edit': ['line_lead', 'admin', 'manager', 'system'],
  'builder:manage': ['admin', 'manager', 'system'],
  'schedule:manage': ['line_lead', 'admin', 'manager', 'system'],
  'closure:manage': ['admin', 'manager', 'system'],
  'recovery:view': ['read_only', 'line_lead', 'admin', 'manager', 'system'],
  'recovery:restore': ['admin', 'manager', 'system'],
  'backup:create': ['admin', 'manager', 'system'],
  'backup:restore': ['manager', 'system'],
  'week:lock': ['admin', 'manager', 'system'],
  'audit:view': ['read_only', 'line_lead', 'admin', 'manager', 'system'],
  'report:export': ['read_only', 'line_lead', 'admin', 'manager', 'system'],
  'settings:manage': ['manager', 'system'],
  'diagnostics:view': ['admin', 'manager', 'system'],
})
