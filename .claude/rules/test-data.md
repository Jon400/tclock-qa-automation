# Test Data

- Create data through the API clients, not the UI, unless the UI flow is what the case
  tests.
- Every entity a test creates is named with the run prefix `qa-<runId>-` (use the builders
  in `src/data/builders/`). Never hard-code entity names in a spec.
- Register every created entity with the `cleanup` fixture. TClock can't delete anything,
  so teardown deactivates it.
- Never read, change, or deactivate an entity without the `qa-` prefix. The owner's own
  data and the two long-lived QA users are off limits.
- Static inputs live in `test-data/{ui,api}/<area>.json` and load through the typed loader
  in `src/data/`. No personal data in them: no real names, phone numbers, or ID numbers.
- Tests are independent: no test relies on another test's data or on execution order.
  Company-wide settings are the exception, and those cases carry `@serial`.
