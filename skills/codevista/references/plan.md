# CodeVista — Visual Plan (local, no dependencies)

Produce a reviewable visual plan as a local file, rendered by a bundled
zero-dependency viewer. NEVER use a hosted Plan MCP, `@agent-native/core`, or an
external network. NEVER dump the plan inline in chat — the deliverable is the
rendered local plan plus its URL.

## Workflow

1. Research the codebase as you normally would (read real files, actions, schema).
   Planning is read-only; make no source edits until the user approves.
2. Read `references/FORMAT.md` for the block grammar (this
   replaces any block catalog lookup — the grammar is the contract). Read
   `references/wireframe.md` and
   `references/document-quality.md` before authoring
   visuals / the document.
3. Write the plan to `plans/<slug>.plan.md` using the FORMAT grammar: markdown for
   prose; fenced blocks for `diff`, `data-model`, `api`, `file-tree`, `wireframe`,
   `mermaid`, `annotated-code`; `:::columns`/`:::tabs`/`:::callout`/`:::question-form`
   containers. Content only — never author HTML/CSS for the page chrome.
4. Start the viewer (background) and report the URL:
   `node scripts/viewer/bin/server.js plans/<slug>.plan.md --open`
   (`scripts/viewer/…` is inside this skill's directory; keep the document path
   relative to your project.)
   Always print the `http://127.0.0.1:<port>` URL in chat. The page live-reloads
   when you edit the file.
5. Ask the user to review and approve at that URL. This is the approval gate.
6. To incorporate feedback: read `plans/comments.json` (or the path the server
   printed). Each comment has `{blockId, text, target, status, quote}`. Act on
   `target:"agent"` comments, edit `plans/<slug>.plan.md` (the page reloads),
   and treat `target:"human"` as context. Re-read before major edits.

## Discipline

- Gate thoughtfully; never ship a single-step or padded plan. Lead with reuse.
- Decide hard-to-reverse bets (wire format, ids, schema, auth) in the plan.
- Put unresolved decisions ONLY in a bottom `:::question-form` titled "Open Questions".
- The file is the source of truth; keep it standalone (no "this revision…" language).
- Wireframe + document quality bars are in `references/` —
  do not author from memory.

## First run (one-time setup)

The viewer ships its browser libraries vendored offline. If the server reports
missing vendored libs, run once (needs network):
`cd scripts/viewer && npm run setup`.
After that it is fully offline. The server self-checks Node ≥ 18 and the vendored
files on startup, so you never need to run environment checks yourself.
