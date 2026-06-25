---
name: codevista
description: >-
  Turn an implementation plan or a branch/commit/PR diff into a rich, interactive,
  commentable visual document rendered fully locally in the browser — no hosted
  server, no MCP, no network. The agent writes only a compact Markdown-superset
  file; a bundled renderer makes it rich. Use for a PLAN when reviewing an
  implementation plan visually before any code is written, or for a RECAP when
  summarizing what changed in a piece of work for review.
compatibility: >-
  Requires Node.js 18+. Network is needed once for first-time viewer setup; git
  is required for recaps.
---

# CodeVista — local visual plans & recaps (no dependencies)

Render a reviewable plan or recap as a local file, served by the bundled
zero-dependency viewer on `127.0.0.1`. NEVER use a hosted Plan MCP,
`@agent-native/core`, or an external network. NEVER dump the document inline in
chat — the deliverable is the rendered local file plus its
`http://127.0.0.1:<port>` URL.

## Pick the mode, then follow that file

- **Visual plan** — authoring/reviewing an implementation plan *before* code is
  written: read `references/plan.md` and follow it.
- **Visual recap** — summarizing a branch/commit/PR diff *after* work is done:
  read `references/recap.md` and follow it.

The shared block grammar (`references/FORMAT.md`) and wireframe kit
(`references/wireframe.md`) are referenced from the mode files; read them when a
mode file says to. All paths are relative to this skill's directory.
