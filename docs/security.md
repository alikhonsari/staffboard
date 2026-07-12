# StaffBoard Security Model

## Authentication

StaffBoard supports signed sessions and the existing shared token fallback. Signed sessions are HMAC-verified with constant-time signature comparison and expiration checks. Secrets must be configured only in DigitalOcean App Platform.

The application must never log or return:

- Passwords
- Session tokens
- Authorization headers
- Cookies
- Spaces access keys
- Spaces secret keys
- Full operational state payloads

Structured logging recursively redacts sensitive key names.

## Permission foundation

The platform permission matrix defines:

| Permission | Read Only | Line Lead | Admin | Manager | System |
| --- | --- | --- | --- | --- | --- |
| View board | Yes | Yes | Yes | Yes | Yes |
| Edit board | No | Yes | Yes | Yes | Yes |
| Manage schedules | No | Yes | Yes | Yes | Yes |
| Manage closures | No | No | Yes | Yes | Yes |
| View recovery | Yes | Yes | Yes | Yes | Yes |
| Restore recovery data | No | No | Yes | Yes | Yes |
| Create backups | No | No | Yes | Yes | Yes |
| Restore full backup | No | No | Yes | Yes | Yes |
| View diagnostics | No | No | Yes | Yes | Yes |
| Manage settings | No | No | No | Yes | Yes |

This phase introduces the centralized model and enforces elevated access for platform diagnostics and backup verification. Migration of every legacy route to granular permissions is tracked as a later roadmap phase.

## Structured errors

New platform endpoints return a legacy-compatible `error` string plus a normalized `errorDetail` object containing:

- Code
- Message
- Retryable flag
- Safe details
- Request ID

No stack trace is returned to normal users.

## Request IDs

Every API request receives an `x-request-id` response header. The same ID is included in structured logs and platform error responses so production problems can be correlated safely.
