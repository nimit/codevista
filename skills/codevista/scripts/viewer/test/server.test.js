// test/server.test.js
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import net from "node:net";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer, resolveCommentsPath, applyAnswer, applyStatus } from "../bin/server.js";

const SERVER = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "server.js");

function start(srcPath) {
  const server = createServer({ srcPath, kind: "plan" });
  return new Promise((res) => server.listen(0, "127.0.0.1", () => res(server)));
}

// A raw HTTP request that bypasses WHATWG-URL normalization. `fetch` (and any
// spec-compliant client) collapses `..`/`%2e%2e` segments before sending, so the
// server's traversal guard can only be reached with a raw, un-normalized target.
function rawStatus(port, target) {
  return new Promise((resolve, reject) => {
    const c = net.connect(port, "127.0.0.1", () =>
      c.write(`GET ${target} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`));
    let buf = "";
    c.on("data", (d) => (buf += d));
    c.on("end", () => resolve(Number((buf.match(/^HTTP\/1\.1 (\d+)/) || [])[1])));
    c.on("error", reject);
  });
}

test("serves /content and round-trips /comments to sidecar", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lv-"));
  const src = join(dir, "x.plan.md");
  writeFileSync(src, "# Hello\n\nbody");
  const server = await start(src);
  after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  const content = await (await fetch(`${base}/content`)).json();
  assert.match(content.source, /# Hello/);

  const c = { id: "c_1", blockId: "b0", text: "fix this", status: "open", target: "agent" };
  await fetch(`${base}/comments`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(c),
  });
  const got = await (await fetch(`${base}/comments`)).json();
  assert.equal(got.length, 1);
  assert.equal(got[0].text, "fix this");
  assert.ok(existsSync(resolveCommentsPath(src)));
  assert.match(readFileSync(resolveCommentsPath(src), "utf8"), /fix this/);
});

test("POST /answers writes selected + answer back into the plan file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lv-"));
  const src = join(dir, "x.plan.md");
  writeFileSync(src, [
    "# T", "",
    ':::question-form title="Open Questions"',
    'q single "Lifetime?"',
    '  - "30 days"',
    '  - "7 days"',
    'q freeform "Constraints?"',
    ":::",
  ].join("\n"));
  const server = await start(src);
  after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body) => fetch(`${base}/answers`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });

  // single: pick the first option (form is block b1 — md "# T" is b0)
  const r = await post({ blockId: "b1", questionIndex: 0, kind: "single", selected: [0], custom: "" });
  assert.equal((await r.json()).ok, true);
  let text = readFileSync(src, "utf8");
  assert.match(text, /- "30 days" selected/);
  assert.doesNotMatch(text, /- "7 days" selected/);

  // single again: switching clears the previous choice
  await post({ blockId: "b1", questionIndex: 0, kind: "single", selected: [1], custom: "" });
  text = readFileSync(src, "utf8");
  assert.doesNotMatch(text, /- "30 days" selected/);
  assert.match(text, /- "7 days" selected/);

  // freeform write-in lands as answer="…" on the q line
  await post({ blockId: "b1", questionIndex: 1, kind: "freeform", selected: [], custom: "ship behind a flag" });
  text = readFileSync(src, "utf8");
  assert.match(text, /q freeform "Constraints\?" answer="ship behind a flag"/);
});

test("applyAnswer persists selected indices and a write-in faithfully", () => {
  const src = [
    ":::question-form",
    'q multi "Which?"',
    '  - "A"',
    '  - "B"',
    '  - "C"',
    ":::",
  ].join("\n");
  const out = applyAnswer(src, { blockId: "b0", questionIndex: 0, kind: "multi", selected: [0, 2], custom: "" });
  assert.match(out, /- "A" selected/);
  assert.doesNotMatch(out, /- "B" selected/);
  assert.match(out, /- "C" selected/);

  // a write-in is recorded alongside the selected options; the client decides
  // exclusivity per question kind, so the server keeps both.
  const out2 = applyAnswer(out, { blockId: "b0", questionIndex: 0, kind: "multi", selected: [0], custom: "also BSD" });
  assert.match(out2, /- "A" selected/);
  assert.doesNotMatch(out2, /- "C" selected/);
  assert.match(out2, /answer="also BSD"/);
});

test("rejects path traversal on static routes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lv-"));
  const src = join(dir, "x.plan.md");
  writeFileSync(src, "# Hi");
  const server = await start(src);
  after(() => server.close());
  const port = server.address().port;
  // Raw socket so the `..` segments survive to the server's guard.
  assert.equal(await rawStatus(port, "/vendor/../../../../etc/passwd"), 400);
  // Sanity: a legitimate vendored file is served.
  assert.equal(await rawStatus(port, "/vendor/marked.esm.js"), 200);
});

test("--help and -h print usage to stdout and exit 0", () => {
  for (const flag of ["--help", "-h"]) {
    const r = spawnSync(process.execPath, [SERVER, flag], { encoding: "utf8" });
    assert.equal(r.status, 0, `${flag} should exit 0`);
    assert.match(r.stdout, /Usage: server\.js/);
    assert.match(r.stdout, /--export/);
    assert.equal(r.stderr, "");
  }
});

test("no source arg prints usage to stderr and exits 1", () => {
  const r = spawnSync(process.execPath, [SERVER], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Usage: server\.js/);
  assert.equal(r.stdout, "");
});

test("applyStatus rewrites the status attr on the matching :::task line", () => {
  const src = [
    "# Plan", "",
    ":::task id=auth-mw status=pending risk=high",
    "title: Auth middleware",
    "outcome: 401 on missing session",
    "verify: npm test auth",
    ":::",
  ].join("\n");
  const out = applyStatus(src, { taskId: "auth-mw", status: "running" });
  assert.match(out, /:::task id=auth-mw status=running risk=high/);
  assert.doesNotMatch(out, /status=pending/);
  // body lines are untouched
  assert.match(out, /title: Auth middleware/);
  assert.match(out, /verify: npm test auth/);
});

test("applyStatus appends status= when the task line has none", () => {
  const src = [":::task id=t2", "title: T", "outcome: O", "verify: V", ":::"].join("\n");
  const out = applyStatus(src, { taskId: "t2", status: "done" });
  assert.match(out, /:::task id=t2 status=done/);
});

test("applyStatus only touches the targeted task among several", () => {
  const src = [
    ":::task id=a status=pending", "title: A", "outcome: O", "verify: V", ":::",
    ":::task id=b status=pending", "title: B", "outcome: O", "verify: V", ":::",
  ].join("\n");
  const out = applyStatus(src, { taskId: "b", status: "running" });
  assert.match(out, /:::task id=a status=pending/);
  assert.match(out, /:::task id=b status=running/);
});

test("applyStatus returns null for an unknown or non-task id", () => {
  const src = [":::task id=t1 status=pending", "title: T", "outcome: O", "verify: V", ":::"].join("\n");
  assert.equal(applyStatus(src, { taskId: "nope", status: "done" }), null);
});

test("applyStatus returns null when an earlier non-task block shadows the task id", () => {
  const src = [
    "```annotated-code file=e.js lang=js id=dup", "code", "```",
    "",
    ":::task id=dup status=pending", "title: T", "outcome: O", "verify: V", ":::",
  ].join("\n");
  // locate() resolves id=dup to the annotated-code block (first match), so a
  // faithful applyStatus refuses rather than silently editing the wrong block.
  assert.equal(applyStatus(src, { taskId: "dup", status: "done" }), null);
});

test("applyAnswer returns null when the id is not a question-form", () => {
  const src = [":::task id=t1 status=pending", "title: T", "outcome: O", "verify: V", ":::"].join("\n");
  assert.equal(applyAnswer(src, { blockId: "t1", questionIndex: 0, kind: "single", selected: [0] }), null);
  assert.equal(applyAnswer(src, { blockId: "nope", questionIndex: 0, kind: "single", selected: [0] }), null);
});

test("--set-status rewrites a task's status in the file and exits 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "lv-"));
  const src = join(dir, "x.plan.md");
  writeFileSync(src, [":::task id=t1 status=pending", "title: T", "outcome: O", "verify: V", ":::"].join("\n"));
  const r = spawnSync(process.execPath, [SERVER, src, "--set-status", "t1=running"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(readFileSync(src, "utf8"), /:::task id=t1 status=running/);
});

test("--set-status rejects an invalid status and exits 1", () => {
  const dir = mkdtempSync(join(tmpdir(), "lv-"));
  const src = join(dir, "x.plan.md");
  writeFileSync(src, [":::task id=t1 status=pending", "title: T", "outcome: O", "verify: V", ":::"].join("\n"));
  const r = spawnSync(process.execPath, [SERVER, src, "--set-status", "t1=bogus"], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /pending\|running\|done\|blocked/);
  assert.match(readFileSync(src, "utf8"), /status=pending/);  // unchanged
});

test("--set-status fails loudly on a duplicated id and leaves the file unchanged", () => {
  const dir = mkdtempSync(join(tmpdir(), "lv-"));
  const src = join(dir, "x.plan.md");
  // The original bug: an annotated-code block and a :::task share id=dup.
  writeFileSync(src, [
    "```annotated-code file=e.js lang=js id=dup", "code", "```",
    "",
    ":::task id=dup status=pending", "title: T", "outcome: O", "verify: V", ":::",
  ].join("\n"));
  const r = spawnSync(process.execPath, [SERVER, src, "--set-status", "dup=done"], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not unique/i);
  assert.match(readFileSync(src, "utf8"), /status=pending/);  // unchanged, no false success
});

test("--set-status fails loudly when no :::task has the id", () => {
  const dir = mkdtempSync(join(tmpdir(), "lv-"));
  const src = join(dir, "x.plan.md");
  writeFileSync(src, [":::task id=t1 status=pending", "title: T", "outcome: O", "verify: V", ":::"].join("\n"));
  const r = spawnSync(process.execPath, [SERVER, src, "--set-status", "ghost=done"], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no :::task/i);
  assert.match(readFileSync(src, "utf8"), /status=pending/);  // unchanged
});

test("comments.json is isolated per plan directory", () => {
  const a = resolveCommentsPath("/proj/plans/alpha/alpha.plan.md");
  const b = resolveCommentsPath("/proj/plans/beta/beta.plan.md");
  assert.notEqual(a, b);
  assert.match(a, /\/plans\/alpha\/comments\.json$/);
  assert.match(b, /\/plans\/beta\/comments\.json$/);
});
