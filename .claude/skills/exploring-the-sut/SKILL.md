---
name: exploring-the-sut
description: Explore a TClock area safely with the Playwright MCP browsers to learn its routes, roles, Hebrew control names and /web/* calls before planning tests. Use when the test planner (or the owner) needs to see how a screen behaves, and when writing or updating .doc/sut/<area>.md.
---

# Exploring the SUT

TClock belongs to someone else. Explore it like a careful human tester: see, don't change.

## The browsers

| MCP server | Logged in as | Use for |
|---|---|---|
| `playwright-operator` | QA Operator (`operator`) | the area's screens and actions |
| `playwright-employee` | QA Employee (SUT role `user`) | what the employee can see, and what is denied |

Both reuse the session the `setup` project saved, run headless in Hebrew (`he-IL`,
`Asia/Jerusalem`), and may only request `https://dev.tclock.co.il`. A session lasts 15 minutes
idle: if a page shows the login form, stop and report it; never log in by hand and never
type a phone number.

## How to explore

1. `browser_navigate` to the area's route, then `browser_snapshot`. The snapshot's roles and
   accessible names are what page objects will use.
2. Walk each acceptance criterion: open the screens, open dialogs and menus, read validation
   messages by submitting obviously incomplete forms.
3. After each action, `browser_network_requests` shows the `/web/*` calls behind it. Record
   the method, path and status, never bodies with people's data.
4. Repeat the role-sensitive parts with `playwright-employee`: which menus are missing, which
   routes show the access-denied warning.

## What you may change

- Nothing that already exists. Never edit, deactivate or submit an entity unless its name
  starts with `qa-`, and never touch company-wide settings.
- When a flow can only be seen by creating something, create one entity named
  `qa-explore-<what>` and write it down under open questions, so the owner can deactivate it.
- No bulk actions, no repeated submissions, no load.

## Write `.doc/sut/<area>.md`

```
# <area> — exploration notes

Explored: YYYY-MM-DD, as operator and employee

## Routes
| Route | Who can open it | What it shows |

## Controls (Hebrew accessible names)
| Screen | Role | Name | Used for |

## /web/* calls
| Action | Method | Path | Status | Notes |

## Behaviour
<rules, validations, state transitions you observed>

## Open questions
```

The Hebrew names go into label maps later (`src/ui/labels/<page>.he.ts`); copy them exactly.
Screenshots stay in `.orchestrate/explore/` and never go into a doc, an issue or a commit.
