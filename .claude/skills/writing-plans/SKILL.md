---
name: writing-plans
description: Create or revise an implementation plan in .plan/. Use whenever the user asks for a plan, an approach or a design doc, when revising a plan after feedback, or when the dev loop asks the orchestrator to scope a test request. Defines the .plan/ lifecycle, the NNN-YYYY-MM-DD-topic.md filename, the metadata and the nine required sections.
---

# Writing Plans

`.plan/` says *how we build*. `000-backlog.md` is the queue; every other file is a plan.
`.test/` says *what we test and how we run it*: a plan links its area's `.test/` files and
never copies test cases into itself.

## Before writing anything
1. Read the existing `.plan/*.md`, even when the request names no plan. A new plan builds on
   decisions already made and never contradicts them silently.
2. Read `.doc/product-definition.md` and, for suite work, `.test/master-test-plan.md` and the
   request (`.orchestrate/request.json` in the dev loop).

## Filename
`NNN-YYYY-MM-DD-<topic>.md`, with the next free number: `.plan/002-2026-10-16-auth-session-expiry.md`.
The dev loop checks the number and the pattern.

## Metadata
Near the top:

```
Status: draft | active | done
Owner:
Request: #<issue> (or "local request")
Last updated: YYYY-MM-DD
```

New plans start as `Status: draft`. Only the owner's approval (Gate A in the dev loop) makes a
plan `active`.

## Required sections
All nine, in this order:

`Goal` · `Scope` · `Assumptions` · `Open Questions` · `Steps` · `Validation` · `Risks` ·
`Rollout Order` · `Rollback`

## Content rules
- Repository-relative paths only. Generated artifacts belong in `.orchestrate/`. Never create
  a `docs/` directory.
- Suite work: `Scope` links the request issue and `.test/<area>/test-plan.md` and
  `.test/<area>/execution-plan.md`. The test planner owns the cases; the plan names which
  framework pieces must exist (fixtures, page objects, clients) and who builds them.
- `Validation` items are commands or tests with a pass/fail result.
- Follow the rules in `.claude/rules/`, especially `sut-safety.md` and `test-data.md`.

## Open Questions and approval
- Ask every question inside the plan, each with a recommended answer.
- Update the plan when answers arrive, then ask for approval before executing it.

## Revising a plan
Rewrite the plan in place. Keep one file per workstream: no superseded copies, and no
"rewritten" or "earlier draft" notes in the body. Git history keeps the old versions.
