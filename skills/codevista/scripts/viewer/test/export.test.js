// test/export.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildStandalone } from "../bin/server.js";

const here = dirname(fileURLToPath(import.meta.url));

test("standalone export inlines content with no external refs", async () => {
  const html = await buildStandalone(join(here, "..", "fixtures", "sample-plan", "plan.md"));
  assert.match(html, /Refresh-token auth/);
  assert.match(html, /diff-line diff-add/);          // pre-rendered, not client-fetched
  assert.doesNotMatch(html, /https?:\/\//);          // no external origins
  assert.doesNotMatch(html, /fetch\(/);              // no runtime fetching
});

test("standalone export sanitizes raw HTML in markdown prose", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lv-"));
  const src = join(dir, "x.plan.md");
  writeFileSync(src, "# T\n\nhello\n\n<img src=x onerror=alert(1)>\n\n<script>alert(2)</script>\n");
  const html = await buildStandalone(src);
  assert.match(html, /hello/);
  assert.doesNotMatch(html, /onerror/);
  assert.doesNotMatch(html, /<script>alert/);
});
