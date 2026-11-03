---
name: adding-an-api-client
description: Add or extend an API client and its zod schemas in src/api/ for a TClock /web/* endpoint. Use when an API case, a UI case's data setup, or a framework request needs an endpoint the framework does not call yet.
---

# Adding an API Client

Specs never call `request.*`. They call a client method; the client knows the route, checks the
status, and parses the body with a schema.

## Files

| File | Holds |
|---|---|
| `src/api/routes.ts` | every `/web/*` path, exactly as TClock serves it, in `WebRoute` |
| `src/api/schemas/<resource>.ts` | zod schemas and their inferred types |
| `src/api/clients/<resource>-client.ts` | `class <Resource>Client extends BaseClient`, one method per endpoint |

## Pattern

```ts
// src/api/clients/session-client.ts
export class SessionClient extends BaseClient {
  // The raw call, for negative cases: requestSession(401).
  requestSession(expectedStatus = 200): Promise<APIResponse> {
    return this.executeGet(WebRoute.authSession, { expectedStatus })
  }

  // The parsed call, for positive cases.
  async getSession(): Promise<SessionResponse> {
    return this.parse(await this.requestSession(200), SessionResponseSchema)
  }
}
```

- Each endpoint gets a raw method that takes `expectedStatus` and returns the `APIResponse`,
  and, when a body matters, a typed method that parses it. Negative cases use the raw one.
- `BaseClient` wraps every call in a `test.step` (`GET /web/auth/session`) and checks the
  status with `expect.soft`, so a spec needs no status assertion of its own.
- Schemas: strict for the fields a case asserts on, `.nullish()` for the rest until an area
  needs them. Field names exactly as TClock sends them (`db_role`, never `role`).
- A client takes any `APIRequestContext`: `operatorApi`, `employeeApi`, `anonymousApi`, or
  `page.request` to share a page's cookies.
- Data setup goes through clients and builders, not the UI (`.claude/rules/test-data.md`).
  Anything a client creates is named by a builder (`qa-<runId>-...`) and registered with the
  `cleanup` fixture, which deactivates it; TClock cannot delete.

## Done when

A unit test in `tests/unit/api/` covers any parsing or status logic you added (pass a recorder
of your own, as `tests/unit/api/base-client.test.ts` does), `npx tsc --noEmit` and
`npx eslint src/` pass, and the framework-architect report lists the new methods.
