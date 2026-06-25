// test/server.test.js
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import net from "node:net";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer, resolveCommentsPath } from "../bin/server.js";

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
