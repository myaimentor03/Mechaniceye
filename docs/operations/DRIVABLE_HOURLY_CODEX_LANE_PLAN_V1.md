# Drivable Hourly Codex Lane Plan V1

## Purpose

Help Glenn run multiple Codex chats without overlapping edits, losing work, or allowing one lane to make operational decisions assigned to another lane.

## Recommended Active Lane Count

Run two or three active implementation lanes at once. A fourth lane should be read-only testing or review. More than three writing lanes makes rebasing, hot-file ownership, and result tracking harder to control.

## Recommended Lanes

| Lane | May touch | Must avoid |
|---|---|---|
| UI lane | Explicitly named files under `client/`, scoped routes, components, and CSS | Backend, `shared/`, Make, payments, unrelated pages |
| Shared/data lane | Explicitly named files in `shared/`, schemas, constants, mock data | UI, server routes, live database or automation |
| Automation/Make lane | `docs/automation/`, payloads, mappings, test evidence; live Make only when Glenn explicitly operates it | Frontend, backend, secrets, unapproved production cutover |
| Docs/marketing lane | `docs/product/`, `docs/marketing/`, approved copy and planning docs | Code, live automation, unsupported promises |
| Operations/testing lane | `docs/operations/`, read-only builds, route checks, issue and tester logs | Product code unless a separate fix queue is approved |

One chat should own one lane and one clearly stated file list.

## Hot / Collision-Prone Files

Treat these as one-writer-at-a-time:

- `client/src/TestBackend.tsx`
- `client/src/app.css`
- `shared/*`

Any README, route registry, shared schema, or index edited by multiple lanes should also be treated as hot.

## Start of Every Lane

1. Run `git pull --rebase origin main`.
2. Run `git status --short`.
3. Stop if rebase is blocked by changes the lane does not own.
4. Inspect the named source files before editing.
5. Restate the allowed and forbidden file surface in the task.

Run `git pull --rebase origin main` again immediately before starting a lane that sat idle, after another lane pushes, and before the final push. If the lane already has edits, commit them first or use an isolated worktree; do not stash or overwrite another lane's work casually.

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

- UI component work that does not touch `app.css` plus operations docs.
- Shared/data types plus docs/marketing copy.
- Automation/Make documentation plus a read-only operations/testing audit.
- Operations templates plus a UI task in an isolated component with no hot-file edits.

## Unsafe Parallel Examples

- Two UI routes both editing `TestBackend.tsx`.
- Two styling tasks both editing `app.css`.
- Two shared/data tasks modifying the same file in `shared/`.
- A UI lane and shared/data lane changing the same contract at the same time.
- An automation lane cutting over Make while a testing lane is still proving recipients and mappings.
- Two lanes updating the same README or route index.

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
