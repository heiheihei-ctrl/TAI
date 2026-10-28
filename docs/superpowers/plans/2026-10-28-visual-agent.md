# Visual Creation Agent Implementation Plan

> Execute inline with superpowers:executing-plans and test-driven-development. User authorized direct implementation of the proposal in chat.

**Goal:** Add Ark visual creation to Tanva chat, with recoverable sessions and durable image/video outputs.
**Architecture:** Independent NestJS controller/client/service backed by Prisma session and turn records; React panel within existing chat. Ark executes tools; Tanva persists public summaries and copies Files API outputs to its existing storage.
**Tech Stack:** NestJS/Fastify, Prisma/PostgreSQL, Axios, React/TypeScript, existing OSS and credits services.
**Spec:** User-approved proposal in conversation and https://docs.volcengine.com/docs/ark/visual-creation-agent?lang=zh

## Global Constraints
- Never persist inline image data or temporary upstream download links in design JSON.
- JWT ownership checks; verify project membership before session creation.
- Connect upstream SSE and wait for ready before posting a user message. Recover missing events through paginated history, without resending an ambiguous submission.
- Register files asynchronously; copy to Tanva storage before exposing an importable asset.
- Leave existing environment/nginx edits intact. No paid live requests or database migration execution.

## Review Focus
- Cross-user session access and concurrent sends must fail.
- Fragmented SSE, initial idle and retrying errors must not falsely finish a turn.
- Disconnect/restart must not resend a paid task.
- Delayed files, failed storage and duplicate outputs must not falsely report success.
- Missing permissions/configuration and invalid references must fail clearly.

### Task 1: Protocol and persistence
- [x] Add failing protocol tests (ready framing, tool configuration, event normalization, remote-only references).
- [x] Implement Ark client and protocol helpers, verify tests.
- [x] Add Prisma session/turn schema and deployment migration (not executed against a database).

### Task 2: Backend execution
- [x] Add tests for ownership, single active turn, ready-before-send, recovery and delayed file registration.
- [x] Implement authenticated controller, session service, recoverable execution and streaming storage.
- [x] Add dedicated configurable credit price using existing pre-deduct/settlement APIs.

### Task 3: Frontend and documentation
- [x] Add visual creation mode and independent panel with history, references, progress, interrupt and asset import.
- [x] Verify protocol/client behavior, backend tests and both builds; run frontend lint and report pre-existing failures.
- [x] Update helloagents wiki/changelog, configuration example and user documentation.

## Progress
- Analysis: existing Workflow Agent plans frontend nodes; it is retained. Existing dirty files are frontend environment and nginx settings.
- Execution: current checkout explicitly requested; no worktree or commits created.
- Review: fixed durable terminal outcomes, expired-turn reconciliation, lease fencing, late-output attribution/reconciliation, latest-history window, deletion/send mutual exclusion, queued cancellation and initial UI hydration race. Added regression tests.

## Verification
- Backend source tests: `npx vitest run src tests` — 9 files, 50 tests passed. Unscoped Vitest also discovers existing compiled CommonJS tests in dist and fails on those copies.
- Frontend production build passed; targeted ESLint for the three new frontend files passed. Repository-wide lint reports 2,762 existing problems (2,533 errors, 229 warnings).
- Backend TypeScript check passed against an isolated client generated from the updated Prisma schema. Standard backend build is blocked by EPERM replacing the Prisma Windows engine DLL; final standalone schema validation also encountered EPERM reading a Prisma dependency. No running user process was stopped.
- `git diff --check` passed. No database migration or paid upstream generation was executed.
- Optional metadata sync script was unavailable at the configured Codex skills location. Wiki and changelog were updated directly.
