# Drivable Daily Build Review Checklist V1

## Review Record

- Date:
- Reviewer:
- Branch/commit:

## Code and Build

- [ ] Latest commits reviewed for scope and unexpected overlap.
- [ ] `git status --short` reviewed.
- [ ] `npm run build` passed.
- [ ] Build warnings or failures recorded.
- [ ] New routes and changed routes opened and checked.
- [ ] Mobile layout checked for changed customer-facing pages.
- [ ] Browser console checked for changed routes.

## Operations

- [ ] Current Make scenario status recorded.
- [ ] Customer email modules remain in the approved test state.
- [ ] Latest route PASS/FAIL evidence reviewed.
- [ ] Known blockers added or updated on the blocker board.
- [ ] Focused testing needed today is named.

## Queue Planning

- [ ] Next safe Codex queues have non-overlapping file ownership.
- [ ] Any lane that must pull/rebase before starting is identified.
- [ ] Work requiring Glenn's undivided attention is separated from autonomous docs/code work.
- [ ] No queue silently changes Make, email, payment, webhook, or production behavior.

## Launch Readiness Delta

- Readiness yesterday:
- Readiness today:
- New evidence gained:
- New blockers:
- Blockers resolved:
- Launch criteria advanced:
- Launch criteria regressed:
- Current decision: `NOT READY` / `GLENN-OWNED TEST ONLY` / `ONE TRUSTED TESTER` / `PAID TEST CANDIDATE`
- Next focused action:
