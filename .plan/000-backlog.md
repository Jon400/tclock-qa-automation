# Prioritized Backlog

Format:
- `- [ ] <area>: <title>`                 a test request for one area, not filed yet
- `- [ ] <area>: <title> | issue:#<n>`    a test request, filed as a GitHub issue
- `- [ ] <title> | plan:<NNN>`            framework or tooling work under an implementation plan

`npm run loop -- --next` takes the first unchecked request line: one that starts with its area
slug or links an issue. Every other line is skipped. With an issue, it runs that request.
Without one, the orchestrator drafts the request from the line, and Gate 0 files it and links
it here. A request can also be filed by hand with `gh issue create --template "Test request"`,
then linked with ` | issue:#<n>`.

Highest risk first (`.test/master-test-plan.md`).

Current queue:
- [ ] QA framework foundation + `.test/` + test-flow dev loop | plan:001
- [ ] auth: session expiry and the re-auth dialog
- [ ] employee-report: the lifecycle; the employee edits and submits, the operator reviews, approves and locks it, or returns it for editing
- [ ] payroll-hours: the preview plus the Excel export (parse the download and assert on it)
- [ ] user: provision, edit, deactivate
- [ ] branch: create (code availability and suggestion) plus policies
- [ ] work-report-location: create (address lookup, map, radius)
- [ ] absence: reporting hours, a half day, a full day and a date range
- [ ] company-policy: view and change the company policies (`@serial`: company-wide state)
- [ ] punch-clock-configuration: view and change the punch-clock settings (`@serial`: company-wide state)
- [ ] daily-attendance: the operator's daily attendance view
- [ ] period-summary: the attendance summary for a period
- [ ] access: the role access matrix, role × route and API
- [ ] public-page: smoke of home, privacy and support
- [ ] Phase 2: the failure-analyzer agent with the triaging-a-failure and writing-a-bug-report skills, once two areas finish the loop without manual repair
- [ ] CI: GitHub Actions workflows that call tools/gates and the run profiles, and publish JUnit and the Allure report as artifacts


## DONE
- [x] Setup
