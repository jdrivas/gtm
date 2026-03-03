# Authentication & Authorization

## Overview

GTM uses **Auth0** for both authentication (who you are) and authorization (what you can do). The JWT access token is the single source of truth for roles — the database does not store roles.

## Architecture

```
Browser → Auth0 login → JWT access token (with custom claims) → Server validates JWT
```

- **Auth0 tenant**: `momentlabs.auth0.com`
- **SPA client ID**: configured per environment via `VITE_AUTH0_CLIENT_ID`
- **API audience**: `https://gtm-api.momentlabs.io`

## Roles

Roles are managed in Auth0 (Dashboard → User Management → Roles) and injected into the JWT access token via a **post-login Action**.

### Custom claim namespace

```
https://gtm-api.momentlabs.io/roles    → ["admin"] or []
https://gtm-api.momentlabs.io/email    → user email
https://gtm-api.momentlabs.io/name     → user display name
```

### Auth0 Action (post-login)

The Action must add custom claims to the access token. Example:

```js
exports.onExecutePostLogin = async (event, api) => {
  const namespace = 'https://gtm-api.momentlabs.io';
  const roles = event.authorization?.roles || [];
  api.accessToken.setCustomClaim(`${namespace}/roles`, roles);
  api.accessToken.setCustomClaim(`${namespace}/email`, event.user.email);
  api.accessToken.setCustomClaim(`${namespace}/name`, event.user.name);
};
```

### How role checks work

1. **Server extracts JWT claims** → `AuthUser { sub, email, name, roles }`
2. **`/api/users/me`** returns `{ id, email, name, role }` where `role` is derived from the JWT on each request
3. **`require_admin()`** checks `auth_user.roles.contains("admin")` — reads the JWT, not the database
4. **Frontend** reads `role` from the `/api/users/me` response to conditionally render admin UI (badge, scrape button, allocation pages)

### Database `users` table

The `users` table stores identity only: `id`, `auth0_sub`, `email`, `name`. There is **no role column**. The server upserts user identity on every authenticated request via `resolve_user()`.

## Setup checklist for a new environment

1. Create an Auth0 SPA Application with the correct callback/logout/origin URLs
2. Create an Auth0 API with audience `https://gtm-api.momentlabs.io`
3. Create an "admin" role in Auth0 → User Management → Roles
4. Assign the "admin" role to admin users
5. Add the post-login Action (above) to the Auth0 Login Flow
6. Set `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE` at build time
7. Set `AUTH0_DOMAIN`, `AUTH0_AUDIENCE` as server environment variables
