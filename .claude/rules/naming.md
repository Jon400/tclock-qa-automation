# Naming

Applies to files, classes, fixtures, test IDs, tags, and data fields.

## Domain terms
- Use TClock's own word for a concept, never a synonym. `company`, never `org`,
  `organization` or `tenant`.
- Keep `geo` (never `geolocation` or `localization`) and `lat` / `lng` for coordinates.
- Canonical terms live in `.doc/glossary.md`. Add a new shared term there before using it
  broadly, and never introduce a second word for a concept that already has one.
- Do not rename the SUT's own identifiers: `/web/*` routes, JSON fields and role values
  (`admin`, `operator`, `user`) are used exactly as TClock serves them.

## Files and directories
- Files are kebab-case, singular, and say what they hold: `login-page.ts`, `user-client.ts`,
  `session.ts` (a schema), `login.he.ts` (a label map), `logout.spec.ts`, `settings.test.ts`.
- Collections keep the guide's plural directory names: `pages/`, `components/`, `clients/`,
  `schemas/`, `labels/`, `assertions/`, `builders/`. The entity files inside them are singular.
- Areas are kebab-case and singular: `auth`, `employee-report`, `user`, `branch`,
  `work-report-location`. The area slug names the test folder, the `.test/` folder, the
  tag, and the branch.

## Code
- Classes are PascalCase with their role as a suffix: `LoginPage`, `UserClient`,
  `DataTable`, `ReAuthDialog`.
- Fixtures are camelCase `<role><Thing>`: `operatorPage`, `employeeApi`.
- Agents use their full role names: `orchestrator`, `test-planner`, `framework-architect`,
  `test-developer` (`test-developer-ui`, `test-developer-api`), `code-reviewer`,
  `failure-analyzer`.

## IDs and tags
- Acceptance criterion: `<AREA>-AC-NN` (`AUTH-AC-01`).
- Test case: `<AREA>-<LAYER>-NNN`, layer `UI`, `API` or `E2E` (`AUTH-UI-001`).
- `<AREA>` is the area slug in upper case (`employee-report` → `EMPLOYEE-REPORT`).
- Tags: `@<area>`, `@smoke`, `@serial`, `@quarantine`. Nothing else without a line in
  `.test/execution-plan.md`.
