# CODEVISTA SKILL

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

CodeVista is **one self-contained Agent Skill** that turns an implementation plan
or a git diff into a rich, interactive, **commentable** visual document, rendered
fully locally in the browser. A coding agent writes only a compact
Markdown-superset file (`plans/<slug>/plan.md` / `recaps/<slug>/recap.md`); a bundled zero-dependency Node
viewer renders it on `127.0.0.1`. No MCP, no hosted server, no network at runtime
(except mermaid — see below).

It ships **two ways from the same folder**, and the priority between them matters:

- **PRIMARY: a universal Agent Skill** conforming to the [Agent Skills
  specification](https://agentskills.io/specification). It must work in *any*
  agent/editor (Claude Code, Codex, Copilot, Gemini, …). This is the feature to
  protect first.
- **SECONDARY: a Claude Code plugin** (via `.claude-plugin/plugin.json` +
  `marketplace.json`). Maintained, but must never come at the cost of universal
  skill compatibility.

When the two conflict, **the skills spec wins.**

## Core invariants (do not break these)

These are deliberate design constraints, not accidents. Changing any of them is a
significant decision:

1. **Paths are relative to the skill directory** — never use host-specific
   variables like `${CLAUDE_PLUGIN_ROOT}`. The skill must be self-contained and
   runnable wherever it is installed. Skill/reference docs say things like
   `node scripts/viewer/bin/server.js …` relative to the skill root.
2. **Zero runtime dependencies.** `scripts/viewer/package.json` `dependencies`
   stays empty. The server (`bin/server.js`) uses **Node built-ins only**. No
   `node_modules` is needed to run, no build step, no bundler, no Python.
3. **No network at runtime** — with one explicit exception: **mermaid** is loaded
   from a CDN at runtime (it lazy-loads diagram chunks relative to its own URL, so
   it can't be meaningfully vendored). mermaid degrades to source text offline.
   `marked` + `DOMPurify` ARE vendored (`vendor/`) and work fully offline. The
   ONLY code allowed to touch the network is `bin/setup.mjs` (one-time vendoring).
   `server.js` must never make network calls.
4. **The FORMAT grammar IS the contract.** `references/FORMAT.md` is the canonical
   schema — there is no hosted block-catalog lookup. The AST node shapes in that
   file are the testable contract; `test/parse.test.js` enforces them. Adding a
   block type means: update `FORMAT.md`, add a parser in `src/blocks.js`, a
   renderer in `src/render.js`, CSS in `web/viewer.css`, and tests.
5. **Local/privacy by construction.** Nothing leaves the machine. There is
   intentionally no hosted plan DB, no share links, no PR sticky comments. The
   human↔agent loop happens entirely through a local `comments.json` sidecar.

## Architecture

The pipeline is **`parse()` → `render()`**, two pure functions in `src/` reused in
three contexts (this is why they take no I/O and inject `md`/`sanitize`):

- `src/parse.js` — tokenizes the Markdown-superset into segments (markdown,
  ` ``` ` fences, `:::` directive containers), then builds an AST of typed
  `Node`s with stable `id`s. Frontmatter (`title`, `kind`) is split off first.
  Unknown fence types fall back to fenced code in a `richtext` block.
- `src/blocks.js` — `LEAF_PARSERS`, one per leaf block type (`diff`, `file-tree`,
  `data-model`, `api`, `wireframe`, `mermaid`, `diagram`, `annotated-code`,
  `callout`) plus `parseQuestionForm`. Each turns a fence body + attrs into a Node.
- `src/render.js` — `render(blocks, {md, sanitize})` wraps each Node in a
  `<section class="block" data-block-id>` (the block id is what comments attach
  to) and dispatches to a per-type HTML renderer. `md`/`sanitize` are injected so
  the same code runs in Node and the browser.
- `src/sanitize.js` — conservative regex HTML-fragment sanitizer, used in Node and
  as the browser fallback when DOMPurify is unavailable.

Three consumers of that pipeline:

- **Live server** (`bin/server.js`) — local HTTP server. Serves the viewer shell
  (`web/viewer.html` + `web/viewer.css`), streams `src/`+`vendor/` as static ESM
  to the browser, exposes `/content`, `/meta`, `/comments` (GET/POST →
  `comments.json` sidecar next to the source), and `/events` (SSE live-reload via
  an `fs.watch` on the source file's dir). Has a `safeStatic` path-traversal
  guard. Auto-increments the port if taken; self-checks Node ≥ 18 + vendored libs
  on the CLI path only (`checkEnv`).
- **Browser glue** (`src/viewer-main.js`, `src/comments-client.js`) — fetches
  `/content`, runs the SAME `parse`/`render` client-side with real `marked` +
  `DOMPurify`, runs mermaid, wires tabs, mounts the comment UI, listens for SSE
  reloads, handles light/dark theme.
- **Standalone export** (`buildStandalone` in `bin/server.js`, `--export`) —
  inlines CSS + rendered HTML into one self-contained file using the SAME
  `parse`/`render` (markdown via vendored `marked`, regex sanitizer). Static: no
  live comments, no mermaid SVG.

**The skill layer** is a thin router. `skills/codevista/SKILL.md` picks the mode,
then defers to one of two workflow files which the agent reads and follows:

- `references/plan.md` — author `plans/<slug>/plan.md`, serve it, gate on user
  approval, incorporate `comments.json` feedback (act on `target:"agent"`).
- `references/recap.md` — build `recaps/<slug>/recap.md` mechanically from a real
  `git diff` (true-by-construction; never invent paths/fields), then serve.
- `references/FORMAT.md` (the grammar/contract), `references/wireframe.md` (the
  wireframe token + helper-class kit), `references/document-quality.md`
  (outcome-first plan-quality bar). The skill is instructed to read these rather
  than author from memory.

## Commands

All viewer commands run from `skills/codevista/scripts/viewer/`:

```bash
npm run setup          # ONE-TIME, needs network: vendor marked + DOMPurify into vendor/
npm test               # full suite via node:test (parse, render, server, e2e, export)
node --test test/parse.test.js                          # one test file
node --test --test-name-pattern="tokenize" test/...js   # one test by name
```

Run the viewer (paths shown from the **repo root**; the skill uses skill-relative paths):

```bash
node skills/codevista/scripts/viewer/bin/server.js plans/<slug>/plan.md --open
node skills/codevista/scripts/viewer/bin/server.js recaps/<slug>/recap.md --export out.html
node skills/codevista/scripts/viewer/bin/server.js --help
```

Key flags: `--open`, `--export <file>`, `--port <n>` (default 4321, auto-increments),
`--host`, `--kind plan|recap` (else inferred from the basename: `recap.md` → recap).

There is no lint config and no build step. Tests are the gate.

## When changing the bundled libs

`bin/setup.mjs` pins exact versions and URLs (currently `marked@12.0.2`,
`dompurify@3.4.10`; mermaid via CDN at `@11.15.0` in `src/viewer-main.js`). To
bump: edit the pin, re-run `npm run setup` on a networked machine, update the
hashes/versions in `vendor/README.md`, and re-commit the vendored files. Vendored
files are committed verbatim (offline-first) — they are not a build artifact.

## Runtime outputs

`comments.json` (the reviewer-feedback sidecar), `plans/`, and `recaps/` are
written at runtime and are gitignored.
