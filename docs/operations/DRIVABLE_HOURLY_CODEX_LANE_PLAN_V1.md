# Drivable Hourly Codex Lane Plan V1

## Purpose

Help Glenn run multiple Codex chats without overlapping edits, losing work, or allowing one lane to make operational decisions assigned to another lane.

## Recommended Lanes

| Lane | May touch | Must avoid |
|---|---|---|
| Product/docs | `docs/product/`, product wording, report definitions | Application code, Make, environment values, payments |
| Operations/docs | `docs/operations/`, test templates, runbooks | Frontend, backend, shared types, live automation |
| Automation/docs | `docs/automation/`, payload and mapping documentation | Editing live Make scenarios unless explicitly assigned |
| Frontend preview | Named components, routes, and scoped CSS in the task | Backend, shared contracts, unrelated pages |
| Shared contracts | Named files in `shared/` | UI, server routes, database, Make |
| Backend/API | Explicitly named server files and tests | Frontend redesign, Make, production secrets |
| Testing/review | Read-only inspection, builds, route checks, issue reports | Source edits unless a separate fix task is approved |

One chat should own one lane and one clearly stated file list.

## Start of Every Lane

1. Run `git pull --rebase origin main`.
2. Run `git status --short`.
3. Stop if rebase is blocked by changes the lane does not own.
4. Inspect the named source files before editing.
5. Restate the allowed and forbidden file surface in the task.

## Avoiding Merge Conflicts

- Give parallel lanes different directories or files.
- Do not run two frontend lanes that both edit `TestBackend.tsx` or `app.css`.
- Do not run two lanes that both update the same README or index.
- Use a separate branch or worktree per active lane.
- Commit only named files; never use `git add .`.
- Before pushing, fetch or pull again and rebase onto current `origin/main`.
- After a rebase, rerun the required build or validation.
- If a remote commit touches the same file, inspect it before resolving. Preserve both changes only when their behavior is compatible.

## Safe Parallel Examples

- Product checklist in `docs/product/` plus a Make payload guide in `docs/automation/`.
- Operations templates in `docs/operations/` plus a read-only frontend route audit.
- One shared-type task plus one docs-only task.
- One isolated frontend component task plus a spreadsheet/documentation task that touches no frontend files.

Unsafe examples include two route tasks editing `TestBackend.tsx`, two style tasks appending to `app.css`, or a code lane and a review lane both fixing the same component.

## Hourly Operating Rhythm

1. Check active lanes and their exact file ownership.
2. Pull/rebase any lane that has not started editing.
3. Let implementation lanes finish build and scoped diff review.
4. Merge or push one overlapping-risk lane at a time.
5. Rebase remaining lanes after each push.
6. Record results, blockers, commit hashes, and the next safe queues.

## Result Report

Every lane should report:

- Files created or changed.
- Behavior, types, or documents added.
- Validation commands and results.
- Commit hash and push result.
- Final `git status --short`.
- Any unrelated files observed and left untouched.
- Any unresolved blocker or follow-up that requires Glenn.

## Stop Conditions

Stop the lane when:

- The worktree contains unexpected changes in an owned file.
- The repository path, branch, or remote does not match the task.
- A pull/rebase conflict cannot be resolved without changing another lane's work.
- The task would require a forbidden system, file, secret, or production action.
- Build failure is caused by the lane and cannot be corrected within scope.
- The requested change could send email, move money, change a webhook, expose data, or affect production without explicit approval.
- The current `origin/main` changed the underlying contract enough that the task assumptions are no longer valid.
