# Apex CRM Admin Platform APIs

These APIs are mounted inside the existing Apex CRM backend and use the real MongoDB collections already used by the app.

Base URL:

```txt
/api/v1/admin/platform
```

Internal-only developer tools:

```txt
/api/v1/internal/platform
```

Internal routes require:

- Valid Apex JWT.
- Owner/super-admin access.
- IP allowlist match from `INTERNAL_ADMIN_IP_WHITELIST`.

## Main Endpoints

```txt
GET    /api/v1/admin/platform/dashboard
GET    /api/v1/admin/platform/admins
POST   /api/v1/admin/platform/admins
GET    /api/v1/admin/platform/users
PATCH  /api/v1/admin/platform/users/:userId/status
POST   /api/v1/admin/platform/users/:userId/block
POST   /api/v1/admin/platform/users/:userId/unblock
POST   /api/v1/admin/platform/users/:userId/roles
GET    /api/v1/admin/platform/users/:userId/sessions
DELETE /api/v1/admin/platform/users/:userId/sessions
POST   /api/v1/admin/platform/users/:userId/impersonate
GET    /api/v1/admin/platform/roles
GET    /api/v1/admin/platform/permissions
GET    /api/v1/admin/platform/settings
POST   /api/v1/admin/platform/settings
GET    /api/v1/admin/platform/feature-flags
POST   /api/v1/admin/platform/feature-flags
GET    /api/v1/admin/platform/security/suspicious-activity
GET    /api/v1/admin/platform/audit
POST   /api/v1/admin/platform/reports
```

## Internal Developer Tools

```txt
GET  /api/v1/internal/platform/database-inspector
POST /api/v1/internal/platform/cache/clear?pattern=cache:*
GET  /api/v1/internal/platform/logs?lines=200
POST /api/v1/internal/platform/api-tester
GET  /api/v1/internal/platform/queues
GET  /api/v1/internal/platform/audit
```

## What Data It Shows

This module reads the real Apex CRM backend models:

- `User`, `Role`, `Session`, `Organization`
- `Customer`, `Supplier`, `Branch`
- `Product`, `Sales`, `Purchase`
- `Invoice`, `Payment`
- `Notification`, `Asset`, `Webhook`
- `ActivityLog`
- new admin-platform collections: `PlatformSetting`, `FeatureFlag`, `PlatformAudit`

## Example

```bash
curl http://localhost:5000/api/v1/admin/platform/dashboard \
  -H "Authorization: Bearer <apex_access_token>"
```

Create an admin:

```bash
curl -X POST http://localhost:5000/api/v1/admin/platform/admins \
  -H "Authorization: Bearer <apex_access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ops Admin",
    "email": "ops@example.com",
    "phone": "9999999999",
    "password": "ChangeMe123!",
    "roleId": "<role_id>",
    "isSuperAdmin": true
  }'
```
