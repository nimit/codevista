# CodeVista

**Local, zero-runtime-dependency visual plans and recaps for coding agents.**

A coding agent writes a compact Markdown-superset file; a bundled Node server
(built-in modules only) renders it as a rich, interactive, **commentable** visual
plan or recap in the browser — entirely on `127.0.0.1`. No MCP, no hosted server,
and the renderer needs no network at runtime; token cost ≈ the document's own
content (the renderer, server, CSS, and libraries are shipped once and cost zero
tokens per plan).

## What's in here

```
codevista/
  .claude-plugin/plugin.json       # makes this an installable Claude Code plugin
  skills/
    codevista/                     # one self-contained Agent Skill (plan + recap)
      SKILL.md                     # thin router: picks plan vs recap mode
      references/
        plan.md                    # plan workflow: author plans/<slug>/plan.md, serve, read comments
        recap.md                   # recap workflow: diff -> recaps/<slug>/recap.md via plain git, serve
        FORMAT.md                  # the authoring grammar IS the contract
        wireframe.md               # wireframe kit (tokens, helper classes, surfaces)
        document-quality.md        # outcome-first plan-quality rules
      scripts/viewer/              # the runtime (Node built-ins only, zero deps)
        bin/server.js              # local HTTP server + CLI (--open / --export)
        bin/setup.mjs              # one-time vendoring of browser libs
        src/                       # pure parse() + render(), browser glue
        web/                       # viewer shell + theme CSS
        vendor/                    # offline libs (marked, DOMPurify; mermaid loads from CDN)
        test/                      # node:test — parse, render, server, e2e, export
        fixtures/                  # sample-plan/plan.md / sample-recap/recap.md
  LICENSE
```

All bundled files are referenced with **paths relative to the skill directory**
(per the [Agent Skills spec](https://agentskills.io/specification)), so the skill
is self-contained and works wherever it is installed — no `${CLAUDE_PLUGIN_ROOT}`
or other host-specific variables required.

## Install

CodeVista ships two ways from the same folder:

- **As a standalone Agent Skill** (agentskills.io / skills.sh format) — install the
  `skills/codevista` folder into your agent's skills directory with the skills CLI,
  pointing at this folder (a GitHub `owner/repo` path, a URL, or a local path):

  ```
  npx skill add <owner>/codevista/skills/codevista
  ```

  Or copy it in directly: `skills/codevista` → `~/.claude/skills/` (global) or
  `.claude/skills/` / `.agents/skills/` inside a project.

- **As a Claude Code plugin** — point your marketplace/plugin config at this repo;
  `plugin.json` (`skills: ./skills/`) exposes the `codevista` skill.

Once installed, the `codevista` skill is available; ask for a visual plan or recap
and it picks the right mode.

## Setup (once, needs network)

```
cd skills/codevista/scripts/viewer
npm run setup        # fetches marked + DOMPurify into vendor/
npm test             # optional: parse, render, server, e2e, export
```

After setup the vendored files are committed-ready and the renderer is fully
offline (mermaid diagrams load from a CDN when online). The server self-checks
Node ≥ 18 and the vendored files on startup.

## Use

The skill drives it, but you can run the viewer directly:

```
node skills/codevista/scripts/viewer/bin/server.js plans/feature/plan.md --open
```

Opens `http://127.0.0.1:4321` — live-reloads on edit; reviewer comments land in
`comments.json` next to the source. Export a shareable single file with
`--export out.html`.

## Authoring format

The grammar in `skills/codevista/references/FORMAT.md` is the contract: ordinary
Markdown plus fenced blocks (`diff`, `data-model`, `api`, `file-tree`, `wireframe`,
`mermaid`, `annotated-code`) and `:::columns` / `:::tabs` / `:::callout` /
`:::question-form` containers.

## What is local vs. dropped

Kept locally: the block-schema-as-grammar, rich rendering, theme + live reload,
the human↔agent comment loop, and git-based diffs. Intentionally dropped (privacy
by construction — nothing leaves the machine): any hosted plan database, sharing /
visibility gating, hosted share links, and PR sticky comments. (mermaid diagrams
are the one exception that reaches the network — rendered from a CDN when online.)

## Requirements

| Need                          | When                      | Notes                                                                             |
| ----------------------------- | ------------------------- | --------------------------------------------------------------------------------- |
| **Node ≥ 18**                 | runtime                   | The only thing required to _run_. Self-checked on startup.                        |
| Network to `cdn.jsdelivr.net` | **once**, at setup        | `npm run setup` vendors two browser libs (marked + DOMPurify), then commit them.  |
| Network                       | runtime, **mermaid only** | mermaid diagrams render from a CDN when online; everything else is fully offline. |
| `git`                         | recaps only               | The recap workflow uses `git diff`.                                               |

No Python. No npm runtime dependencies. No build step. No bundler.

## Credits

Some of CodeVista is inspired by the visual-plan / visual-recap skill by
**Builder.io**. CodeVista is an independent, fully-local reimplementation with no
hosted dependency.

## License

MIT — see [LICENSE](LICENSE).
