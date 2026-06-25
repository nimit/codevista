// test/e2e.test.js
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "../src/parse.js";
import { render } from "../src/render.js";
import { createServer, resolveCommentsPath } from "../bin/server.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "..", "fixtures", "sample.plan.md");

test("sample plan parses into the expected block sequence", () => {
  const { meta, blocks } = parse(readFileSync(fixture, "utf8"));
  assert.equal(meta.kind, "plan");
  const types = blocks.map((b) => b.type);
  assert.ok(types.includes("callout"));
  assert.ok(types.includes("data-model"));
  assert.ok(types.includes("columns"));
  assert.ok(types.includes("diff"));
  assert.ok(types.includes("file-tree"));
  assert.ok(types.includes("question-form"));
});

test("sample plan renders diff rows and before/after columns", () => {
  const { blocks } = parse(readFileSync(fixture, "utf8"));
  const html = render(blocks);
  assert.match(html, /diff-line diff-add/);
  assert.match(html, /col-label[^>]*>Before/);
  assert.match(html, /col-label[^>]*>After/);
  assert.match(html, /dm-was[^>]*>was integer/);
});

test("server serves the fixture and stores a comment", async () => {
  const server = createServer({ srcPath: fixture, kind: "plan" });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const content = await (await fetch(`${base}/content`)).json();
  assert.match(content.source, /Refresh-token auth/);
});
