# local-viewer

Zero-dependency local renderer for visual plans and recaps. No hosted server,
no MCP, no network at runtime.

## Requirements

- **Node ≥ 18** — the only runtime requirement. The server self-checks this on
  startup.
- A one-time `npm run setup` (needs network once) vendors the browser libraries.
  After that, everything is offline (except mermaid diagrams — see below).

## First-time setup (once)

    npm run setup     # fetches marked + DOMPurify into vendor/ (commit-ready)

This is the only step that touches the network. `server.js` never does.

## Run

    node bin/server.js path/to/feature.plan.md --open

Opens a live, commentable view at http://127.0.0.1:4321 (auto-reloads on edit).
Reviewer comments are written to `comments.json` next to the source.

## Export a shareable single file

    node bin/server.js path/to/feature.plan.md --export feature.html

Produces one self-contained HTML file (CSS + rendered content inlined, no
external refs). Static: no live comments, no mermaid SVG.

## Format

See `../references/FORMAT.md`. In short: ordinary Markdown plus fenced blocks
(`diff`, `data-model`, `api`, `file-tree`, `wireframe`, `mermaid`,
`annotated-code`) and `:::columns` / `:::tabs` / `:::callout` /
`:::question-form` containers.

## What is local vs. lost vs. hosted

Local: authoring, rich rendering, theme, live reload, comment loop (via
`comments.json`). Lost vs. hosted: real-time multi-user sharing, account/org
visibility gating, hosted share links, PR sticky comments.

## Dependencies

- **Runtime:** Node ≥ 18 only. `package.json` `dependencies` is empty and stays
  empty. No `node_modules` needed to run.
- **Setup (once):** network access to `cdn.jsdelivr.net` to vendor two browser
  libs (marked + DOMPurify). No Python, no build step, no bundler.
- **Recaps:** `git` (for `git diff`), used by the recap skill only.

### Note on mermaid (online-only)

mermaid is **not** vendored — the viewer loads it from a CDN at runtime (it
lazy-loads diagram chunks relative to its own URL, so vendoring the loader alone
can't render diagrams). Consequence: mermaid diagrams **render when you're online**
and **degrade to source text offline**. marked + DOMPurify are vendored and work
fully offline. See `vendor/README.md` and `src/viewer-main.js`.

## Tests

    npm test    # node:test — parse, render, server, e2e, export
