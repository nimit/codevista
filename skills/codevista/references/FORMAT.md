# The authoring format — the block contract (full spec)

This is the canonical grammar for `*.plan.md` / `*.recap.md` files. **It is the
contract** — it replaces any hosted block-catalog lookup (there is no
`get-plan-blocks` round-trip; the grammar here *is* the schema). The local
renderer parses this format client-side into rich blocks.

It is a **Markdown superset**: anything that is not inside a fence is ordinary
GitHub-flavored Markdown (headings, lists, **bold**, `code`, tables, checklists,
links) and renders as a `richtext` block. Structured/visual blocks are expressed
two ways.

## Block ids

Most blocks take an `id=<id>` attribute. That id is the anchor comments attach to
and the handle `--set-status` and answer write-backs target. **Ids must be unique
within a document.** Use a **random 8-character alphanumeric id** (e.g.
`id=x7k2p9qa`) — not a semantic name. Semantic names invite collisions (two blocks
about the same thing, say an `annotated-code` block and its `:::task`, both getting
`id=driver-engine`), and because id lookup resolves to the *first* match, a
collision silently misroutes id-addressed writes. A block with no `id=` gets a
positional fallback (`b<index>`) — fine for throwaway prose, but give an explicit
random id to anything referenced by a comment, a `depends-on`, or `--set-status`.
Duplicate ids are reported, not tolerated: the server warns on startup and
`--set-status` refuses (exits non-zero) rather than editing the wrong block.

## 1. Leaf blocks — fenced code blocks with an info string

A fence is ` ```<type> key=value key="quoted value" ` … ` ``` `. The info
string's first token is the block type; the rest are attributes. Supported leaf
types and their bodies:

- **`diff`** — `file=<path> lang=<id> summary="…" mode=split|unified id=<id>`.
  Body is a standard unified diff (lines start with `+`, `-`, or space; `@@`
  hunk headers optional). Annotate via `note@<line>: …` lines at the end of the
  body.
- **`file-tree`** — `id=<id>`. Body is indented lines, each:
  `<glyph> <path>  <note?>` where glyph ∈ `+` added, `~` modified, `-` removed,
  `>` renamed (path may be `old -> new`), or none for unchanged. Two-or-more
  spaces separate path from note. Indentation (2 spaces/level) sets depth.
- **`wireframe`** — `surface=browser|desktop|mobile|popover|panel label="…"
  skeleton=true id=<id>`. Body is a semantic HTML fragment using ONLY `--wf-*`
  tokens + helper classes (see `wireframe.md`). No
  `<html>/<head>/<body>/<script>/<style>`.
- **`mermaid`** — `id=<id>`. Body is mermaid source. (Rendered by mermaid, which the viewer loads from a CDN — needs network; degrades to source text offline.)
- **`diagram`** — `id=<id>`. Body is an HTML fragment using `.diagram-*`
  primitives and `--wf-*` tokens. (Author HTML only; CSS classes live in the
  renderer.)
- **`data-model`** — `id=<id>`. Body grammar (one entity block per entity):
  ```
  entity <Name> [added|modified|removed|renamed]?
    <field>: <type> [change]? (was: <oldtype>)? -- <note>?
  ```
- **`api`** — `method=GET|POST|… path=/x change=… deprecated=true id=<id>`. Body
  grammar:
  ```
  param <name> in=query|path|body|header type=<t> [change]? (was: <old>)? -- <note>?
  request <label> | <one-line JSON>
  response <status> <label> | <one-line JSON>
  desc <markdown one-liner>
  ```
  Each JSON example MUST be a single parseable JSON value.
- **`annotated-code`** — `file=<path> lang=<id> id=<id>`. Body is the code, with
  annotation lines collected from trailing `note@<lines>: <text>` lines
  (lines = `12` or `12-18`).
- **`callout`** — `tone=info|decision|warn|ok id=<id>`. Body is markdown.

## 2. Container blocks — `:::` directive fences (may contain leaf blocks)

```
:::tabs id=<id>
```diff file=a.ts summary="…"
…
```
```diff file=b.ts summary="…"
…
```
:::
```

- **`:::tabs`** — children are leaf blocks; each child's `label` attr (or
  `file`/`path`) names its tab. Horizontal tabs by default.
- **`:::columns`** — children are leaf blocks; each child's `label` attr names
  the column (use `Before`/`After`). Wide surfaces (`desktop`/`browser`)
  auto-stack; narrow surfaces sit side by side.
- **`:::callout tone=decision`** — markdown body (alternative to the fenced
  `callout` when you want nested blocks).
- **`:::question-form` title="Open Questions"** — body grammar:
  ```
  q single|multi|freeform "Question text?" answer="free-text write-in"?
    - "Option A" recommended selected detail="…"
    - "Option B" detail="…"
  ```
  `recommended` marks the suggested default; `selected` marks the reviewer's
  actual choice (one for `single`, several for `multi`). A write-in is stored as
  `answer="…"` on the `q` line. The viewer writes `selected` / `answer` back into
  the file via `POST /answers` when a reviewer answers in the served page.
- **`:::task`** — `id=<id> status=pending|running|done|blocked risk=normal|high`.
  A unit of implementation work, written as human-readable intent (never
  pre-baked code). Body is one `key: value` per line:
  ```
  title: <one-line summary of the task>          (required)
  outcome: <what "done" looks like, in prose>    (required)
  verify: <how to check it — command and/or manual step>   (required)
  scope: <files/area to work in>                 (optional)
  depends-on: <task-id, task-id>                 (optional, comma/space list)
  constraints: <decisions the implementer must honor>      (optional)
  notes: <gotchas>                               (optional)
  ```
  `status` defaults to `pending` and renders as a live badge. During execution the
  status is advanced (`pending → running → done`/`blocked`) by rewriting the
  `status=` attribute on the `:::task` line —
  `node scripts/viewer/bin/server.js <plan> --set-status <id>=<status>` — which the
  server's `fs.watch`+SSE turn into a live dashboard update (the same write-back
  rail as `selected`/`answer`).

## 3. Frontmatter

Optional YAML-ish frontmatter at the top sets document metadata:

```
---
title: Refresh-token auth
kind: plan        # plan | recap
---
```

Only `title` and `kind` are read; both optional (defaults: title from first `#`
heading, kind from file extension).

## AST node shapes (the testable contract)

`parse(source)` returns `{ meta: {title, kind}, blocks: Node[] }`. Every `Node`
has a stable `id` (explicit `id=` attr, else `b<index>`), unique per document (see
[Block ids](#block-ids)). Node shapes:

```js
{ type:'richtext',  id, md:string }
{ type:'callout',   id, tone:'info'|'decision'|'warn'|'ok', md:string }
{ type:'diff',      id, file, lang, summary, mode:'split'|'unified',
                    hunks:[{header, lines:[{kind:'add'|'del'|'ctx', text, n}]}],
                    annotations:[{lines, note}] }
{ type:'file-tree', id, entries:[{depth, change:'added'|'modified'|'removed'|'renamed'|null, path, to?, note?}] }
{ type:'wireframe', id, surface, label, skeleton:boolean, html:string }
{ type:'mermaid',   id, source:string }
{ type:'diagram',   id, html:string }
{ type:'data-model',id, entities:[{name, change, fields:[{name,type,was,change,note}]}] }
{ type:'api',       id, method, path, change, deprecated, desc, params:[{name,in,type,was,change,note}],
                    requests:[{label,example}], responses:[{status,label,example}] }
{ type:'annotated-code', id, file, lang, code, annotations:[{lines, note}] }
{ type:'tabs',      id, tabs:[{label, blocks:Node[]}] }
{ type:'columns',   id, wide:boolean, columns:[{label, blocks:Node[]}] }
{ type:'question-form', id, title, questions:[{kind, text, answer, options:[{label,detail,recommended,selected}]}] }
{ type:'task', id, status:'pending'|'running'|'done'|'blocked', risk:'normal'|'high',
                    title, outcome, verify, scope, dependsOn:[ids], constraints, notes }
```

## Worked example

````markdown
---
title: Refresh-token auth
kind: plan
---

# Refresh-token auth

Add rotating refresh tokens so sessions survive access-token expiry.

:::callout tone=decision
Chosen: opaque refresh tokens stored hashed, rotated on every use.
:::

## Data shape

```data-model
entity Session [modified]
  id: uuid [pk]
  refreshHash: text [added] -- sha256 of the rotating token
  expiresAt: timestamptz [modified] (was: integer) -- now a real timestamp
```

## UI

:::columns
```wireframe surface=mobile label="Before"
<div style="display:flex;flex-direction:column;gap:10px;padding:16px;height:100%">
  <h1>Signed out</h1>
  <p class="wf-muted">Your session expired. Please sign in again.</p>
  <button class="primary">Sign in</button>
</div>
```
```wireframe surface=mobile label="After"
<div style="display:flex;flex-direction:column;gap:10px;padding:16px;height:100%">
  <h1>Welcome back</h1>
  <span class="wf-pill accent">Session refreshed</span>
</div>
```
:::

## Key change

```diff file=actions/auth.ts lang=ts summary="rotate refresh token on use"
 export async function refresh(token: string) {
-  const s = await db.session.find({ token })
+  const s = await db.session.find({ refreshHash: sha256(token) })
+  const next = rotate(s)
+  return next
}
note@2: new lookup is by hash, not raw token
```

```file-tree
~ actions/auth.ts   rotate + hash lookup
+ lib/tokens.ts     sha256 + rotate helpers
```

:::question-form title="Open Questions"
q single "Refresh token lifetime?"
  - "30 days" recommended detail="matches current mobile expectation"
  - "7 days" detail="tighter, more re-logins"
:::
````
