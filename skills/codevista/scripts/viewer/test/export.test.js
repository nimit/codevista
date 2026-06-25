// test/export.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildStandalone } from "../bin/server.js";

const here = dirname(fileURLToPath(import.meta.url));

test("standalone export inlines content with no external refs", async () => {
  const html = await buildStandalone(join(here, "..", "fixtures", "sample.plan.md"));
  assert.match(html, /Refresh-token auth/);
  assert.match(html, /diff-line diff-add/);          // pre-rendered, not client-fetched
  assert.doesNotMatch(html, /https?:\/\//);          // no external origins
  assert.doesNotMatch(html, /fetch\(/);              // no runtime fetching
});
