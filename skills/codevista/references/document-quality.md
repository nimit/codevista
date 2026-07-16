# Plan document quality — single source of truth

This file is the canonical quality bar for the plan document: how it reads,
which blocks to use, how open questions are surfaced, and the pre-handoff
check. Read it in full before authoring the plan document; it is the quality
bar. Do not write the document from memory or paraphrase these rules per mode.

**The document is a serious technical plan, not marketing.** Write it the way a
strong Claude or Codex implementation plan reads: outcome-first, prose-first,
self-contained, and specific. State the objective and what "done" means, the
scope and non-goals, the proposed approach with the key decisions and their
rationale, ordered steps that name real files, symbols, actions, and data
shapes, the risks, and a closing verification step (tests, build, or a checkable
behavior). Replace vague prose with specifics; never ship a step like "make it
work." No hero art, gradients, logos, nav bars, slogans, value props, giant
landing-page headings, or marketing cards unless the user explicitly asks.

**Every published plan must stand alone.** Even when the agent is revising an
existing plan, the output is a plan to do the work, not a changelog of the
conversation. Do not write phrases like "preserve the previous plan", "do not
drop the old idea", "as discussed above", "this revision", "unlike the prior
version", or "correction from the earlier plan". Fold the right decisions into
the plan as normal objective, architecture, scope, and roadmap prose. A reviewer
who opens the plan from a link with no chat history should understand it. Avoid
negative framing that only makes sense against absent context ("not the old
mode", "not just X") unless the contrast is defined in the plan and genuinely
helps; state the positive model directly.

**Make abstract plans instantly legible.** If the idea is broad, strategic, or
intended for a third-party reviewer, put one concrete product snapshot near the
top before dense architecture, mode tables, manifests, or roadmaps. For
UI-capable concepts, that snapshot is usually a `wireframe` (or `:::columns` of
wireframes) near the top of the document plus a short paragraph that says what
the user sees and what changes under the hood. Then put mechanics, data flow,
sync boundaries, and implementation detail in separate diagrams or document
sections.

**Preserve the user's level of abstraction.** A motivating use case is not
automatically the architecture. When the prompt describes a broader framework,
product mode, or reusable primitive, separate the reusable core from specific
apps, providers, customers, scripts, or launch examples. Use the concrete
example to make the plan understandable, then make clear which parts are core,
which are app-specific adapters, and which are future examples.

**When top visuals exist, they and the document never duplicate each other.**
For UI work, the UI story lives in the top wireframe(s) near the top of the
document. The document carries the technical depth the visuals cannot show —
concrete file/symbol maps, API and data contracts, code snippets, migration or
implementation phases, risks, and validation. For architecture/code reviews,
invert that: the document is the visual surface, and each recommendation
carries its own nearby inline `diagram` / `data-model` block plus file
evidence (the `diagram` bullet below owns how to author those diagrams).
Repeat a wireframe in the document only for a genuinely new detail view or
comparison. Skip the visual surface entirely for non-visual work and write a
clean rich document. For a simple binary UI visual choice, show the two
directions in the top wireframe(s) only; do not repeat the same options as later
body wireframes or prose. Put the actual choice in the bottom "Open Questions"
form.

**Use the right block, and make it carry substance.** For the authoritative list
of block types and their grammar, see `FORMAT.md` (the grammar IS the contract —
there is no catalog lookup):

- `richtext` for plan prose with real bold/italic/code/links and nested lists.
- `annotated-code` for the file map: when a load-bearing file is worth
  highlighting, prefer the annotated walkthrough over a bare `code` block — carry
  the real, syntax-highlighted code AND anchor short margin notes to the lines
  that actually change (the new action, the changed schema, the wiring point), so
  the reader sees what matters and why instead of code for code's sake. Each
  annotation is `{ lines: "12" | "12-18"; label?; note }`; keep a few high-signal
  notes per file, not one per line. Highlight only the files worth reading; never
  an exhaustive list of every touched file, and never a prose-only description of
  a file. Drop to a plain `code` block only for a throwaway snippet with nothing
  to call out. When more than one file matters, group the blocks in a vertical
  `tabs` block (the standard tab primitive) rather than a bespoke container. If
  the exact code is unknown, show the smallest plausible planned shape or a
  commented stub naming what to fill in.
- For a decision: if the reviewer must still pick between a genuinely-open
  either/or, put it in the bottom Open Questions `question-form` as a `single`
  question — one option per real alternative, each with a short detail and
  `recommended: true` on the one you would choose; do not also restate the same
  choice elsewhere. If you have already committed to an approach, state it as
  settled prose or a `callout` with `tone="decision"`, optionally with a
  `columns` block for a side-by-side comparison of the options you weighed — not
  as a confusing mid-document form for a question you have already answered.
- `columns` for side-by-side before/after or current/target comparisons where
  each side needs real nested blocks; label the columns clearly and avoid
  stacking comparison blocks vertically when parallel reading is the point.
- `diagram` for two-dimensional architecture, dependency, data-flow, or state
  relationships, only when it clarifies something real. Prefer standard
  two-dimensional layouts — paired before/after panels, layered diagrams,
  swimlanes, dependency maps, matrices, or grouped regions; do not default to
  left-to-right chains, and use a line only when the relationship is truly a
  sequence. For architecture/code
  diagrams, prefer the `diagram` fence body (semantic HTML + inline SVG) so
  the diagram can use panels, layers, matrices, arrows, annotations, and
  responsive layout directly. Author diagram HTML with renderer-owned primitives
  like `.diagram-panel`, `.diagram-card`, `.diagram-node`, `.diagram-box`,
  `.diagram-pill`, `.diagram-muted`, and `[data-rough]`; they map to the plan's
  Tailwind theme variables through `--wf-ink`, `--wf-muted`, `--wf-line`,
  `--wf-paper`, `--wf-card`, `--wf-accent`, `--wf-accent-soft`, `--wf-warn`, and
  `--wf-ok`, and the renderer owns the font and optional sketch outlines. Do not
  set `font-family` and do not hard-code hex, rgb, or hsl colors in diagram HTML
  or CSS. Leave room for the sketch font: keep labels short, give nodes generous
  width, and place boundary/annotation labels in unused space instead of over
  nodes; labels must not overlap nodes, connectors, or each other. For small
  text/SVG changes to an existing HTML diagram, edit the `diagram` fence body and
  save. In architecture/code plans, prefer a repeated section rhythm:
  recommendation title, confidence and category badges, code-path evidence, a
  local before/after or current/target spatial diagram, then concise
  Problem/Solution/Why text.
- `tabs` for multiple states, directions, or comparisons. A tab that reveals
  only prose usually means the plan is under-specified — include a relevant
  visual unless the tab is intentionally document-only.
- `table`, `checklist`, `callout` for scannable structure.

**Plan the work as tasks, sized for a reviewer.** A serious plan ends in an
ordered set of `:::task` blocks — the executable units. Before writing them, map
the files and responsibilities the work touches; split by responsibility, not by
technical layer, and keep files that change together together. Then draw task
boundaries so each task is the smallest unit worth an independent review gate:
fold setup, scaffolding, and docs into the task whose deliverable needs them, and
split only where a reviewer could meaningfully accept one task while rejecting its
neighbor. Give every `:::task` an explicit random `id=` (e.g. `id=x7k2p9qa`) so
status write-back and `depends-on` references stay stable when the plan is
rewritten. Each task carries human-readable intent, never pre-baked code:

- `title` / `outcome` / `verify` are required. `outcome` states what "done" looks
  like; `verify` is the concrete check (a command and/or a manual step). These two
  are the contract the work is held to — make them specific and checkable, never
  "make it work".
- `scope` anchors the implementer to the right files/area. `constraints` pins the
  load-bearing or hard-to-reverse decisions (schema, wire format, auth, ids,
  "reuse the existing X") so they are not improvised. `notes` carries gotchas.
- Interfaces between tasks are **discovered, not declared**: the implementer reads
  the real, already-committed code from earlier tasks rather than trusting a
  hand-written signature. Use `depends-on` to express real ordering; add an
  interface hint in `notes` only when it genuinely saves a lookup.
- `risk=high` marks a task whose decisions are load-bearing or hard to reverse, so
  review pays it extra attention.

State the testing posture once in the plan's overview as a global line — **TDD
where a test harness exists for the area; otherwise implement against the task's
`verify`** — and let each task's `verify` make it concrete. Do not enumerate the
same tasks twice (a prose walkthrough above and task cards below); the cards are
the task narrative.

**Open questions live at the bottom as a form when answers would change the
plan.** Surface answerable unresolved decisions in a final `question-form`
block titled "Open Questions" so the renderer presents it as a distinct section.
That bottom form is the ONLY place that enumerates the open questions: never add
a second "Open Questions" heading, list, or recap of the same questions earlier
in the document. A one-line pointer in the overview prose ("a few decisions are
still open — see Open Questions below") is fine, but do not reproduce the
question list or a parallel questions/decisions section above it.
Use `single` or `multi` for clear choices, `freeform` for constraints,
`recommended: true` for the default you would pick, and option `wireframe` /
`diagram` previews only when the options are not already visible in the top
wireframe(s). `single` and `multi` questions always render a write-in field so a
reviewer can answer with a custom option. Once a reviewer answers in the served
viewer, the choice is written back into the file as `selected` (or `answer="…"`);
on your next pass, read those markers, keep the question in place with the choice
highlighted, and treat it as the decision — do not delete or rewrite the
question, and store any write-in additively as `answer="…"` without changing the
authored options.
Keep non-answerable assumptions or risks as concise `callout` blocks in
the relevant section. Never bury a questions/decisions wall inside the plan
narrative, and never ask the same question twice.

For complex plans, do not end without an open-question audit. If architecture,
scope, UX, data shape, rollout, provider mapping, or ownership still depends on
a choice, either commit to a recommendation with rationale or add it to the
bottom form with a recommended default. A complex plan with no open questions is
fine only when every meaningful decision has been explicitly made.

**Verification must exercise the real workflow.** The final verification section
should go beyond typecheck/unit tests when the plan changes UI, local files,
sync, providers, browser behavior, or multi-app flows. Include at least one
end-to-end smoke that matches the user journey, such as a fresh repo/folder,
real manifest or data fixture, browser interaction, save/sync action, and an
on-disk or database assertion. Name the command or manual browser path when it
is known.

**There is no `custom-html` block.** Prefer the native blocks. For rich local
HTML/SVG architecture diagrams use a `diagram` fence; for product screens use a
`wireframe` fence. Never emit `<script>` or `<style>`; never paste a whole page
document into a block.

**Before handoff, open the plan and check it.** Fix overlap, excessive
whitespace, clipped fragments, misleading inactive controls, poor contrast, and
unreadable diagrams before asking for approval.
