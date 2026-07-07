// test/e2e.test.js
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "../src/parse.js";
import { render } from "../src/render.js";
import { createServer, resolveCommentsPath, applyStatus } from "../bin/server.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "..", "fixtures", "sample-plan", "plan.md");

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

test("a status transition in the file is reflected in served /content", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lv-"));
  const src = join(dir, "exec.plan.md");
  writeFileSync(src, [":::task id=t1 status=pending", "title: T", "outcome: O", "verify: V", ":::"].join("\n"));
  const server = createServer({ srcPath: src, kind: "plan" });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  let content = await (await fetch(`${base}/content`)).json();
  assert.match(content.source, /status=pending/);

  // the executor advances the task's status in the served file
  writeFileSync(src, applyStatus(readFileSync(src, "utf8"), { taskId: "t1", status: "running" }));

  content = await (await fetch(`${base}/content`)).json();
  assert.match(content.source, /status=running/);
  const { blocks } = parse(content.source);
  assert.equal(blocks.find((b) => b.id === "t1").status, "running");
});
