# Vendored libraries (offline, committed)

These are checked into git so the renderer needs **no network at runtime** — every
clone / install ships them. They are fetched once by `npm run setup` (see
`../bin/setup.mjs`) and then committed. `server.js` never touches the network; it
only serves these files locally.

| File | Package | Version | License | Role |
| --- | --- | --- | --- | --- |
| marked.esm.js | marked | 12.0.2 | MIT | Markdown → HTML (browser) |
| purify.es.mjs | dompurify | 3.4.10 | Apache-2.0 / MPL-2.0 | HTML-fragment sanitizing (browser) |

Versions are pinned **exactly** in `bin/setup.mjs`, so re-running setup fetches
the same bytes that are committed here.

> **mermaid is not vendored.** It lazy-loads diagram-type chunks relative to its
> own URL, so the viewer loads it from a CDN at runtime instead of vendoring its
> multi-MB chunk tree. That makes mermaid diagrams **online-only**: they render
> when you have network and degrade to source text offline. Everything else (the
> renderer, marked, DOMPurify) is fully local. See `../src/viewer-main.js`.

## Licenses & attribution

Both vendored files are redistributed under permissive licenses and carry their
license banners inline:

- **marked** — MIT License. Copyright (c) 2011-2018 Christopher Jeffrey and
  2018-present the MarkedJS contributors. https://github.com/markedjs/marked
- **DOMPurify** — Apache License 2.0 / Mozilla Public License 2.0 (dual). (c)
  Cure53 and other contributors. https://github.com/cure53/DOMPurify

mermaid (loaded from the CDN at runtime, not vendored) is MIT, (c) 2014-2022 Knut
Sveidqvist — https://github.com/mermaid-js/mermaid

## Integrity (SHA-256)

Verify the committed bytes weren't altered:

```
288515814e901ea6535521d9fb35a1329455d3d3973de8723db998536f979cf2  marked.esm.js
c8fce077f2e0bcc7022e7e0e378f2565b2ca9a17d6043947ad137d33a6c11ed2  purify.es.mjs
```

Check with: `cd vendor && sha256sum -c <(grep -E '^[0-9a-f]{64}  ' README.md)`.

## Updating (and the one maintenance duty)

Committed blobs are **not** seen by Dependabot / `npm audit`, so nothing will
alert you to a CVE — most importantly in **DOMPurify**, which is the XSS sanitizer.
Periodically refresh it yourself:

1. Bump the pinned version(s) in `bin/setup.mjs`.
2. Re-run `npm run setup` on a networked machine.
3. Recompute and replace the SHA-256 lines above (`sha256sum vendor/*.js vendor/*.mjs`).
4. Re-commit the changed files.
