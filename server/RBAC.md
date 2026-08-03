# GearGuard RBAC policy

The API session is the only authority for identity and role. Client-provided user IDs never establish ownership.

Administrators are the super-role: they retain exclusive governance access and
also inherit every operational capability available to managers.

| Capability | User | Technician | Manager | Admin |
|---|---:|---:|---:|---:|
| Read equipment and work-center reference data | Yes | Yes | Yes | Yes |
| Create a maintenance request | Yes, as self | Yes, as self | Yes, as self | Yes, as self |
| Read maintenance requests | Own created | Assigned to self | All | All |
| Read scheduled maintenance | Own created | Assigned to self | All | All |
| Add request notes | Own created | Assigned to self | All | All |
| Update request status | No | Assigned to self | All | All |
| Assign requests | No | Self-assignment only | All eligible users | All eligible users |
| Edit or delete requests | No | No | Yes | Yes |
| Read teams and members | Yes | Yes | Yes | Yes |
| Enumerate all eligible users | No | No | Yes | Yes |
| Manage teams, equipment, and work centers | No | No | Yes | Yes |
| View administration overview and audit log | No | No | No | Yes |
| Change non-admin user roles | No | No | No | Yes |

## Session security

- Opaque random session identifiers are stored only in an `HttpOnly` cookie.
- Only SHA-256 hashes of session identifiers are stored in the database.
- Sessions expire after eight hours by default and are revoked on logout.
- Unsafe API methods require the per-session `X-CSRF-Token`.
- Password reset tokens are random, single-use, hashed at rest, and expire after one hour.
- A successful password reset revokes all sessions for that account.
- Authentication endpoints are rate limited and return `Cache-Control: no-store`.

## Production configuration

Set `NODE_ENV=production`, an exact comma-separated `CORS_ALLOWED_ORIGINS`, `CLIENT_URL`, and a suitable `SESSION_TTL_MS`. HTTPS is required in production because the session cookie is marked `Secure`.
