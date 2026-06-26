// test/render.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "../src/parse.js";
import { render, escapeHtml } from "../src/render.js";

const md = (s) => `<p>${escapeHtml(s).replace(/\n+/g, "</p><p>")}</p>`; // stub markdown

test("diff renders split rows with add/del classes and summary", () => {
  const { blocks } = parse(
    "```diff file=auth.ts summary=\"add refresh\"\n const a=1\n-const b=2\n+const b=3\n```"
  );
  const html = render(blocks, { md });
  assert.match(html, /data-type="diff"/);
  assert.match(html, /class="diff-summary"[^>]*>add refresh/);
  assert.match(html, /diff-line diff-del/);
  assert.match(html, /diff-line diff-add/);
});

test("wireframe wraps html in the correct surface frame and sanitizes", () => {
  const { blocks } = parse(
    "```wireframe surface=mobile label=\"After\"\n<div onclick=\"x()\">Hi</div>\n```"
  );
  const html = render(blocks, { md });
  assert.match(html, /class="wf-surface wf-surface-mobile"/);
  assert.match(html, /wf-frame-label[^>]*>After/);
  assert.doesNotMatch(html, /onclick/); // sanitized
});

test("file-tree renders change glyphs and notes", () => {
  const { blocks } = parse("```file-tree\n+ a.ts  new\n~ b.ts  edit\n```");
  const html = render(blocks, { md });
  assert.match(html, /ft-change ft-added/);
  assert.match(html, /ft-note[^>]*>new/);
});

test("question-form renders option buttons and shows a saved write-in as a selected card", () => {
  const { blocks } = parse([
    ':::question-form title="Open Questions"',
    'q single "Lifetime?"',
    '  - "30 days" recommended selected',
    '  - "7 days"',
    'q freeform "Constraints?" answer="ship behind a flag"',
    ":::",
  ].join("\n"));
  const html = render(blocks, { md });
  assert.match(html, /class="qf-opt qf-selected[^"]*"[^>]*aria-pressed="true"/); // selected listed option
  assert.doesNotMatch(html, /type="radio"/);    // no native radios
  assert.doesNotMatch(html, /type="checkbox"/); // no native checkboxes
  // the write-in is shown as a selected custom-option card, not pre-filled in the input
  assert.match(html, /qf-custom-opt/);
  assert.match(html, /<b>ship behind a flag<\/b>/);
  assert.doesNotMatch(html, /value="ship behind a flag"/);
});

test("columns marks wide and includes column labels", () => {
  const { blocks } = parse(
    ":::columns\n```wireframe surface=desktop label=\"Before\"\n<div>a</div>\n```\n```wireframe surface=desktop label=\"After\"\n<div>b</div>\n```\n:::"
  );
  const html = render(blocks, { md });
  assert.match(html, /class="columns is-wide"/);
  assert.match(html, /col-label[^>]*>Before/);
});
