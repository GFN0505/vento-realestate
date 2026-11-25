# 0009 · Web and API on the same origin

- **Date:** 2026-11-25
- **Status:** accepted

## Context
The web app calls the API on every screen, and Better Auth (brick 2) uses session cookies. Serving them from different origins means CORS rules, `SameSite=None` cookies and preflight requests on every call, which are slower on weak connections and easier to get wrong.

## Decision
The browser always talks to its own origin. In development, Vite proxies `/rpc` and `/health` to the API on port 3000. In production, the web app and the API are served under one domain (the API under `/rpc` and `/api/auth`), by the host's routing or a reverse proxy.

## Consequences
- No CORS configuration and first-party `SameSite=Lax` cookies.
- The hosting choice (devops) must support path-based routing to the API.
- Portals for buyers and realtors can still live on the developer's own domain later, behind the same rule.

## Alternatives considered
- Separate `api.` subdomain with CORS: more moving parts and slower for no benefit at this size.
