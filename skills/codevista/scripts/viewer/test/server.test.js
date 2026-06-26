// test/server.test.js
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import net from "node:net";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer, resolveCommentsPath, applyAnswer } from "../bin/server.js";

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
