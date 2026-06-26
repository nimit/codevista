# CodeVista — Brainstorm (understand what to build)

Use this when the task is not yet clear enough to plan. Goal: reach a confident,
shared understanding of *what* to build, then author the visual plan
(`references/plan.md`). This is lightweight intent-extraction, not a separate
spec artifact — the conclusions land directly in the plan.

## Workflow

1. Explore the project context first (read relevant files, recent commits, docs).
2. Ask clarifying questions **one at a time**, multiple-choice when possible.
   Cover purpose, constraints, and what success looks like. Don't overwhelm.
3. If the request spans several independent subsystems, flag it and decompose
   into sub-projects before planning one; plan the first one through `plan.md`.
4. Propose 2-3 approaches with trade-offs; lead with your recommendation and why.
5. For a genuinely visual question (layout, before/after, option comparison),
   render a quick `wireframe`/`diagram` mockup in the viewer and let the user
   compare there — the viewer is the visual companion. Use the terminal for
   conceptual/text choices.
6. When the shape is clear, stop asking and author the plan (`plan.md`). The
   conclusions become the plan's objective, scope, approach, and `:::task` set;
   unresolved choices go in the bottom "Open Questions" form.

## Discipline

- The approval gate is the **served plan**, not a spec doc — do not write a
  separate design/spec file.
- Project-level decomposition (one project vs. several) lives here; task-level
  decomposition and right-sizing live in `references/document-quality.md` — read
  that when authoring, and do not restate it here.
- YAGNI: cut features that don't serve the goal. Stay at the user's level of
  abstraction; don't invent scope.
