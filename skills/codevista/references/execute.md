# CodeVista — Execute (autonomously implement an approved plan)

Use this after a plan's `:::task` set is approved, to implement it and close the
loop with a recap for code review. The plan file is the single source of truth:
each `:::task` carries the intent; you derive the code against the real repo, and
you write each task's `status` back into the plan so the served viewer becomes a
live execution dashboard.

## The per-task contract (identical in every topology)

For each task, in order: **derive → implement → verify → self-review → status →
integrate.**

1. **Derive.** Read the real files named in the task's `scope` (and what they
   import) as they exist *now*. Compile the task's `outcome`/`verify`/`constraints`
   into a concrete change against reality — never against plan-time guesses.
   Interfaces are discovered from committed code, not from hand-written signatures.
2. **Implement.** Make the change. Honor `constraints` exactly (they pin the
   hard-to-reverse decisions). Stay within `scope` unless the work genuinely
   requires more — and say so when it does.
3. **Verify.** Run the task's `verify`. **Adaptive TDD:** where a test harness
   already covers the area, write the failing test first and implement to green;
   otherwise implement to the task's `verify` (command and/or manual check).
4. **Self-review.** Re-read the diff against `outcome`/`verify`/`constraints`: is
   the outcome actually met, the verification real (not faked), the constraints
   respected, the scope not overrun? `risk=high` tasks get extra scrutiny.
5. **Status.** Advance the task's status in the **served plan file** by rewriting
   its `status=` attribute:
   `node scripts/viewer/bin/server.js <plan> --set-status <id>=<status>`
   (the CLI accepts `pending|running|done|blocked`; the executor writes
   `running`, `done`, or `blocked`). The running server's `fs.watch`
   turns this into an SSE reload, so the dashboard reflects it live with no extra
   transport. Set `running` when a task starts, `done` when it passes review,
   `blocked` (and tell the user why) when it cannot proceed. Always target the
   served plan path — not a worktree copy — or the dashboard will not update.
6. **Integrate.** Bring the task's verified change into the working tree. Respect
   the host/user commit policy: commit per task only where that policy allows (for
   example, to merge a worktree back). Never push or open a PR autonomously — the
   human reviews the result via the recap.

## Topology — adapt to the platform and the task graph

Pick the simplest topology that fits — by what the environment supports *and* by
what each task is worth (delegation has a cost; spend it where it pays). Do not
assume any one platform's subagent API; describe the need ("dispatch a
fresh-context worker", "isolate concurrent edits") and use whatever the
environment provides.

- **`depends-on` is the schedule.** Build the task graph from each task's
  `depends-on`. A task is eligible once all its dependencies are `done`; run
  eligible tasks together when you can. Only real dependencies serialize.
- **Delegate when it pays off.** When the environment can dispatch fresh-context
  workers *and* the work warrants it — independent tasks that can run concurrently,
  or a task big enough that a clean isolated context implements it better than the
  controller's loaded one — dispatch one **implementer** per task plus a per-task
  **reviewer** (two verdicts: `outcome`/`verify`/`constraints` compliance, and code
  quality). **File-handoff discipline:** the brief, the implementer's report, and
  the review diff pass as **file paths**, never pasted into the controller's context
  — this keeps the controller's context flat regardless of task count.
- **Stay inline when it doesn't.** Subagents are a tool, not a mandate. Run a task
  inline — same per-task contract, the controller doing it directly — when the
  change is small or localized, or when the controller already holds the exact
  context a brief would only have to re-package (handoff overhead exceeding the task
  is itself a reason to stay inline). Inline trades the per-task independent reviewer
  for the controller's self-review plus the final recap, so prefer delegation for
  `risk=high` or wide-blast-radius work and lean inline for the rest.
- **Worktrees only when actually concurrent.** Parallel file-mutating tasks each run
  in their own git worktree; a task's work merges back once its review passes.
  Sequential or inline execution skips worktrees entirely.
- **Graceful degradation.** No subagent capability at all → every task runs inline,
  fresh reasoning per task, no worktrees; a dependency chain serializes, independent
  tasks still run inline one after another. The per-task contract is unchanged across
  every topology — only who runs each step and how tasks are isolated changes.

## Closing the loop

When every task reaches `done`, offer a **recap of the full diff** as the
code-review surface (`references/recap.md`). It is built true-by-construction from
the real `git diff` of the executed work — the human's review entry point, paired
with the live dashboard they watched fill in. Leave a `blocked` task's status in
place and surface it to the user instead of forcing a recap.

## Discipline

- The plan file is the source of truth; keep `status` honest and current.
- Task intent is the contract; the code is derived, never copied from the plan.
- Do not restate task-decomposition rules here — they live in
  `references/document-quality.md`. This file is the execution loop only.
