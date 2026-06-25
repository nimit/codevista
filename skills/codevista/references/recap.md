# CodeVista — Visual Recap (local, no dependencies)

Summarize a diff as a local visual recap rendered by the bundled viewer. No
hosted Plan MCP, no `@agent-native/core`, no network. Never dump the recap inline.

## Workflow

1. Collect the diff with plain git: `git diff --stat <base>...HEAD`,
   `git diff <base>...HEAD`, `git log --oneline <base>...HEAD`. Scope to the work
   unit; exclude unrelated pre-existing edits.
2. Read `references/FORMAT.md` and
   `references/wireframe.md`.
3. Write `recaps/<slug>.recap.md` mechanically from the real diff: a `file-tree`
   with change flags; `data-model`/`api` for schema/contract changes; `wireframe`
   (before/after) for rendered-UI changes; and a `## Key changes` `:::tabs` block of
   `diff`/`annotated-code` for the load-bearing files (3–8 tabs). Build structured
   blocks from real paths/fields/lines only — never invent. Redact any secrets.
4. Start the viewer and report the URL:
   `node scripts/viewer/bin/server.js recaps/<slug>.recap.md --open`
   (`scripts/viewer/…` is inside this skill's directory; keep the document path
   relative to your project.)
   Always print the `http://127.0.0.1:<port>` URL. The page live-reloads on edit.
5. Iterate on `comments.json` exactly as in the plan workflow (`references/plan.md`):
   read the sidecar next to the source, act on `target:"agent"` comments, edit the
   file.

## Discipline

- Lean but substantial: wireframe(s) for UI changes + file-tree + key-change diffs.
- Skip the recap for tiny/obvious diffs that review faster in plain git.
- Grounding rule: structured blocks are true-by-construction from the diff only.

## First run (one-time setup)

If the server reports missing vendored libs, run once (needs network):
`cd scripts/viewer && npm run setup`. After that it is fully
offline. The server self-checks Node ≥ 18 and the vendored files on startup.
