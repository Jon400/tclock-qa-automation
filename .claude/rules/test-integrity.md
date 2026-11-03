# Test Integrity

The five non-negotiable rules. Each is enforced by code, not by this text.

| # | Rule | Enforced by |
|---|---|---|
| 1 | Never change an assertion just to make a test pass | `tools/gates` integrity check: an edited or removed `expect(` line in a spec that exists on `main` fails the gate. Only the owner can pass `--allow-assertion-change` |
| 2 | Never skip a failing test silently | ESLint `playwright/no-skipped-test`, `playwright/no-focused-test`, and bans on `test.fixme` / `test.fail`. `@quarantine` is valid only for case IDs listed in `.test/quarantine.md` |
| 3 | Validate generated code automatically | `tools/gates`: tsc, ESLint, Prettier, `playwright test --list`, Vitest, traceability and AC coverage, integrity, config guard, secretlint. The exit code is the verdict |
| 4 | Least privilege | `.claude/hooks/`: per-role write paths, secret files, destructive commands and `gh` for agents, TClock host allowlist. Restricted `tools:` per agent. The driver re-checks each stage's changed files |
| 5 | Keep the automation deterministic | ESLint `no-restricted-imports`: no `@anthropic-ai/*`, `openai`, or `tools/` import in `src/` or `tests/`. LLMs plan and write; they never run inside a test |

When a test fails, find out why. A product bug becomes a bug draft; a test bug is fixed in
the test without weakening what it proves. When the check itself is wrong, say so in your
report and leave the decision to the owner.
