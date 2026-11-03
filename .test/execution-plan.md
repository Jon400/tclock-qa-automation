# Execution plan — global

Status: active
Owner: Jon400
Last updated: 2026-10-16

How runs happen. Each area's `execution-plan.md` adds its own front matter on top.

## Run profiles

| Profile | Selection | When | Gating |
|---|---|---|---|
| `unit` | `vitest run` | pre-commit and every gate run | yes |
| `gate` | static checks + `--list` + unit + custom checks (`npm run gate`) | every loop round, before every commit | yes |
| `setup` | `--project=setup` (`npm run test:setup`) | once at the start of every run | yes: no login, no run |
| `smoke` | `--grep @smoke` against dev | entry criterion for every area run | yes. Red smoke means the environment is broken and the run stops |
| `area` | the area's `grep`, then new cases × `newCaseRepeat` | the Test Runner stage | yes, against the area's exit criteria |
| `regression` | everything except `@quarantine` | before the PR (nightly once CI exists) | yes |

The driver runs `setup` once as its own step, then every profile with `--no-deps`, so
`--repeat-each` never repeats the login. Tests tagged `@serial` run in a separate
`--workers=1` invocation after the parallel ones.

## Tags

| Tag | Meaning | Added by |
|---|---|---|
| `@<area>` | The case's area. Derived from the case ID by `testCase()` | framework |
| `@smoke` | Part of the smoke profile: few, fast, P1, read-only where possible | test-planner (in the plan), test-developer |
| `@serial` | Changes company-wide state; never runs in parallel with anything | test-planner |
| `@quarantine` | Excluded from exit criteria and regression; needs an entry in `quarantine.md` | owner |

## Parallelism

- `fullyParallel: true`, 2 workers: TClock is someone else's dev server.
- Tests are independent: no shared mutable data, no order dependence.
- `@serial` cases run alone, with `--workers=1`.

## Retry and quarantine policy

- Retries are always 0. A retry hides flakiness; the config guard fails any other value.
- New or changed cases run `newCaseRepeat` times (default 3) in the area profile. A case
  that both passes and fails is flaky.
- A flaky case gets a quarantine proposal at Gate B. A product-bug case is quarantined
  against its bug issue after filing. Only the owner writes `quarantine.md`.
- Quarantined cases still run in the area profile, so a fix shows up; they do not count
  toward exit criteria and are excluded from regression.

## Run artifacts

Every run writes `.orchestrate/runs/<run-id>/` (run id `YYMMDD-HHMMSS-xxxx`):

| Path | Content |
|---|---|
| `<step>/junit.xml` | JUnit, per Playwright invocation (`setup`, `smoke`, `area`, `repeat`, `serial`, `regression`) |
| `<step>/results.json` | Playwright JSON report |
| `<step>/test-results/` | Traces and screenshots of failures (`trace: retain-on-failure`) |
| `allure-results/` | Allure results of every step; `npm run report` builds the report |
| `summary.json` | Per case: outcome across steps and repeats |
| `failures.json` | Every failure with its class (env, flaky, untriaged, test bug, product bug), error and trace path |

Traces can hold session cookies. They stay local and are never attached to an issue.
