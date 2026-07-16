#!/usr/bin/env node
// bin/server.js  (Node built-ins only)
import http from "node:http";
import { readFile, readFileSync, writeFileSync, existsSync, watch } from "node:fs";
import { join, dirname, resolve, extname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { parse, locate, duplicateIds, splitFrontmatter } from "../src/parse.js";
import { render } from "../src/render.js";
import { sanitizeHtml } from "../src/sanitize.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(__dirname, "..");           // scripts/viewer/
const STATIC_ROOTS = { "/viewer.css": join(PKG, "web", "viewer.css") };
const STATIC_DIRS = { "/src/": join(PKG, "src"), "/vendor/": join(PKG, "vendor"), "/web/": join(PKG, "web") };
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".html": "text/html", ".json": "application/json", ".svg": "image/svg+xml" };

export function resolveCommentsPath(srcPath) {
  return join(dirname(resolve(srcPath)), "comments.json");
}

// Document kind from the filename: the plans/<slug>/plan.md and
// recaps/<slug>/recap.md convention. Anything else defaults to plan
// (override with --kind).
export function inferKind(srcPath) {
  return basename(srcPath) === "recap.md" ? "recap" : "plan";
}

// True for the loopback spellings a local browser can legitimately send in
// Host/Origin. Anything else on a loopback-bound server means DNS rebinding or
// a cross-origin request — both refused.
export function isLoopbackHost(raw) {
  let h = String(raw ?? "").trim().toLowerCase();
  const bracketed = h.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) h = bracketed[1];
  else if ((h.match(/:/g) || []).length <= 1) h = h.replace(/:\d+$/, "");
  return h === "127.0.0.1" || h === "localhost" || h === "::1";
}

function readComments(srcPath) {
  const p = resolveCommentsPath(srcPath);
  if (!existsSync(p)) return [];
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return []; }
}
function writeComments(srcPath, list) {
  writeFileSync(resolveCommentsPath(srcPath), JSON.stringify(list, null, 2));
}

// Set or remove a key="value" attr on a single line (empty value removes it).
function setAttr(line, key, value) {
  const stripped = line.replace(new RegExp(`\\s*${key}="[^"]*"`), "");
  return value ? `${stripped} ${key}="${value}"` : stripped;
}
// Add or remove a bare word flag (e.g. `selected`) on a single line.
function toggleFlag(line, flag, on) {
  const stripped = line.replace(new RegExp(`\\s*\\b${flag}\\b`), "");
  return on ? `${stripped} ${flag}` : stripped;
}

// Record a reviewer's answer by rewriting ONLY the matched question/option lines
// of `source` in place: `selected` (option indices) drives the `selected` flags
// and `custom` sets answer="…". Faithful persistence — the client (which knows
// single vs multi) decides how options and a write-in combine, so the server
// just writes what it is told. Pure + exported so it is unit-testable. Returns
// null when blockId does not resolve to a question-form block OR questionIndex
// does not match a question in it, so the caller can surface an error instead
// of silently writing nothing (a no-op must never look like a success).
export function applyAnswer(source, { blockId, questionIndex, kind, selected = [], custom = "" }) {
  const loc = locate(source, blockId);
  if (!loc || loc.type !== "question-form") return null;
  const lines = source.split(/\r?\n/);
  const qLines = [];
  for (let i = loc.startLine; i <= loc.endLine; i++)
    if (/^q\s+(single|multi|freeform)\b/.test(lines[i])) qLines.push(i);
  const qStart = qLines[questionIndex];
  if (qStart == null) return null;
  const qEnd = qLines[questionIndex + 1] ?? (loc.endLine + 1);

  const clean = String(custom).replace(/[\r\n]+/g, " ").replace(/"/g, "'").trim();
  lines[qStart] = setAttr(lines[qStart], "answer", clean);

  let optIdx = 0;
  for (let i = qStart + 1; i < qEnd; i++) {
    if (!/^\s*-\s*"/.test(lines[i])) continue;
    lines[i] = toggleFlag(lines[i], "selected", selected.includes(optIdx));
    optIdx++;
  }
  return lines.join("\n");
}

// Keep or skip a single test in a `tests` block by toggling the bare `skip` flag
// on its list line (located by id via locate()). Tests are kept by default, so
// `skip=true` writes the flag and `skip=false` removes it. Pure + exported so it
// is unit-testable; returns null when blockId does not resolve to a `tests` block
// OR index does not match a test item, so the caller surfaces an error instead of
// a silent no-op (the same faithfulness bar as applyAnswer / applyStatus).
export function applyTestSelection(source, { blockId, index, skip }) {
  const loc = locate(source, blockId);
  if (!loc || loc.type !== "tests") return null;
  const lines = source.split(/\r?\n/);
  let itemIdx = 0, target = -1;
  for (let i = loc.startLine + 1; i <= loc.endLine; i++) {
    if (!/^\s*-\s*"/.test(lines[i])) continue;
    if (itemIdx === index) { target = i; break; }
    itemIdx++;
  }
  if (target < 0) return null;
  // Toggle `skip` only in the tail AFTER the quoted description — a bare
  // toggleFlag would also strip the word "skip" out of the test text itself.
  const m = lines[target].match(/^(\s*-\s*"[^"]*")(.*)$/);
  if (!m) return null;
  const tail = m[2].replace(/\s*\bskip\b/g, "");
  lines[target] = m[1] + (skip ? `${tail} skip` : tail);
  return lines.join("\n");
}

// Advance a :::task's status by rewriting the `status=` token on its opening
// directive line (located by id via locate()). Pure + exported so it is
// unit-testable; the CLI (--set-status) validates the allowed status set, so this
// stays faithful and writes whatever it is told. Returns null when the id does not
// resolve to a :::task block (unknown id, or an earlier block shares it) — the
// caller turns that into a visible error instead of a silent no-op / false success.
export function applyStatus(source, { taskId, status }) {
  const loc = locate(source, taskId);
  if (!loc || loc.type !== "task") return null;
  const lines = source.split(/\r?\n/);
  const line = lines[loc.startLine];
  const re = /\bstatus=("[^"]*"|'[^']*'|\S+)/;
  lines[loc.startLine] = re.test(line)
    ? line.replace(re, `status=${status}`)
    : `${line.replace(/\s+$/, "")} status=${status}`;
  return lines.join("\n");
}

function send(res, status, body, type = "text/plain") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

function safeStatic(prefix, baseDir, url) {
  const rel = decodeURIComponent(url.slice(prefix.length));
  if (rel.includes("\0")) return null;
  const full = resolve(baseDir, rel);
  const root = resolve(baseDir);
  if (full !== root && !full.startsWith(root + "/")) return null; // traversal guard
  return full;
}

export function createServer({ srcPath, kind }) {
  const sseClients = new Set();

  // live reload: watch the source file's directory for changes to the file.
  // unref() so the watcher never independently keeps the process alive (the
  // HTTP server does that in real use; tests exit cleanly after close()).
  let watcher = null;
  try {
    watcher = watch(dirname(resolve(srcPath)), (_e, fn) => {
      if (fn === basename(srcPath)) {
        for (const res of sseClients) res.write("event: reload\ndata: 1\n\n");
      }
    });
    watcher.unref?.();
  } catch { /* watch best-effort */ }

  const server = http.createServer((req, res) => {
    const url = req.url.split("?")[0];

    // Trust boundary. When bound to loopback (the default), a non-loopback Host
    // means the browser was pointed here via a DNS-rebound name — refuse before
    // serving anything. POSTs additionally must be same-site (no foreign Origin)
    // and real JSON: a drive-by page can only emit "simple" cross-origin
    // requests (form/text-plain, no preflight), and comments feed the agent, so
    // both checks matter.
    const addr = server.address();
    const boundLoopback = !addr || typeof addr === "string" || isLoopbackHost(addr.address);
    if (boundLoopback && !isLoopbackHost(req.headers.host)) return send(res, 403, "forbidden host");
    if (req.method === "POST") {
      const origin = req.headers.origin;
      if (origin) {
        let sameSite = false;
        try { sameSite = new URL(origin).host === String(req.headers.host || "") } catch { /* malformed */ }
        if (!sameSite && !(boundLoopback && isLoopbackHost(origin.replace(/^https?:\/\//, ""))))
          return send(res, 403, "cross-origin write refused");
      }
      if (!String(req.headers["content-type"] || "").toLowerCase().includes("application/json"))
        return send(res, 415, "expected application/json");
    }

    if (url === "/" || url === "/index.html") {
      return readFile(join(PKG, "web", "viewer.html"), (e, b) =>
        e ? send(res, 500, "no viewer") : send(res, 200, b, "text/html"));
    }
    if (url === "/content") {
      try {
        const source = readFileSync(srcPath, "utf8");
        return send(res, 200, JSON.stringify({ source, path: srcPath }), "application/json");
      } catch { return send(res, 404, JSON.stringify({ error: "source missing" }), "application/json"); }
    }
    if (url === "/meta") {
      const source = existsSync(srcPath) ? readFileSync(srcPath, "utf8") : "";
      const title = splitFrontmatter(source).meta.title || basename(srcPath);
      return send(res, 200, JSON.stringify({ title, kind, path: srcPath }), "application/json");
    }
    if (url === "/comments" && req.method === "GET") {
      return send(res, 200, JSON.stringify(readComments(srcPath)), "application/json");
    }
    if (url === "/comments" && req.method === "POST") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        let c; try { c = JSON.parse(raw); } catch { return send(res, 400, "bad json"); }
        const list = readComments(srcPath);
        // `{ id, deleted:true }` removes a comment; anything else upserts by id
        // (a new comment appends; an existing id — edit or resolve — merges).
        if (c && c.deleted) {
          writeComments(srcPath, list.filter((x) => x.id !== c.id));
        } else {
          const i = list.findIndex((x) => x.id === c.id);
          if (i >= 0) list[i] = { ...list[i], ...c }; else list.push(c);
          writeComments(srcPath, list);
        }
        send(res, 200, JSON.stringify({ ok: true }), "application/json");
      });
      return;
    }
    if (url === "/answers" && req.method === "POST") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        let a; try { a = JSON.parse(raw); } catch { return send(res, 400, "bad json"); }
        if (typeof a?.blockId !== "string" || !Number.isInteger(a.questionIndex) || a.questionIndex < 0)
          return send(res, 400, JSON.stringify({ error: "expected { blockId: string, questionIndex: int >= 0 }" }), "application/json");
        try {
          const source = readFileSync(srcPath, "utf8");
          // same faithfulness bar as --set-status: a duplicated id would silently
          // write to the first match, so refuse instead.
          if (duplicateIds(source).includes(a.blockId))
            return send(res, 409, JSON.stringify({ error: `block id "${a.blockId}" is not unique` }), "application/json");
          // rewrite the answered line in place — fs.watch turns this into an SSE
          // reload (the originating tab suppresses that one; see answers-client.js).
          const updated = applyAnswer(source, a);
          if (updated === null)
            return send(res, 409, JSON.stringify({ error: "no question-form block/question with that id and index" }), "application/json");
          writeFileSync(srcPath, updated);
          send(res, 200, JSON.stringify({ ok: true }), "application/json");
        } catch { send(res, 500, JSON.stringify({ error: "write failed" }), "application/json"); }
      });
      return;
    }
    if (url === "/tests" && req.method === "POST") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        let t; try { t = JSON.parse(raw); } catch { return send(res, 400, "bad json"); }
        if (typeof t?.blockId !== "string" || !Number.isInteger(t.index) || t.index < 0)
          return send(res, 400, JSON.stringify({ error: "expected { blockId: string, index: int >= 0, skip: bool }" }), "application/json");
        try {
          const source = readFileSync(srcPath, "utf8");
          // same faithfulness bar as /answers: a duplicated id would silently
          // write to the first match, so refuse instead.
          if (duplicateIds(source).includes(t.blockId))
            return send(res, 409, JSON.stringify({ error: `block id "${t.blockId}" is not unique` }), "application/json");
          // toggle the item's skip flag in place — fs.watch turns this into an SSE
          // reload (the originating tab suppresses that one; see tests-client.js).
          const updated = applyTestSelection(source, { ...t, skip: !!t.skip });
          if (updated === null)
            return send(res, 409, JSON.stringify({ error: "no tests block/item with that id and index" }), "application/json");
          writeFileSync(srcPath, updated);
          send(res, 200, JSON.stringify({ ok: true }), "application/json");
        } catch { send(res, 500, JSON.stringify({ error: "write failed" }), "application/json"); }
      });
      return;
    }
    if (url === "/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      res.write("event: hello\ndata: 1\n\n");
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }
    if (STATIC_ROOTS[url]) {
      return readFile(STATIC_ROOTS[url], (e, b) =>
        e ? send(res, 404, "nf") : send(res, 200, b, MIME[extname(url)] || "text/plain"));
    }
    for (const [prefix, dir] of Object.entries(STATIC_DIRS)) {
      if (url.startsWith(prefix)) {
        const full = safeStatic(prefix, dir, url);
        if (!full) return send(res, 400, "bad path");
        return readFile(full, (e, b) =>
          e ? send(res, 404, "nf") : send(res, 200, b, MIME[extname(full)] || "text/plain"));
      }
    }
    send(res, 404, "not found");
  });
  server.on("close", () => { try { watcher?.close(); } catch { /* ignore */ } });
  return server;
}

function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open"
    : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    // spawn reports a missing opener (e.g. headless/WSL with no xdg-open) via an
    // async 'error' event, not a throw; without this listener it would crash the
    // server. Swallow it and point the user at the URL that's already printed.
    child.on("error", () => console.log(`Couldn't auto-open a browser — open ${url} manually.`));
    child.unref();
  } catch { /* ignore */ }
}

// Single self-contained HTML file (CSS + rendered content inlined), for
// sharing/archiving/PR artifacts with no server. Uses the SAME pure parse()/
// render() functions; markdown via the vendored marked (ESM-importable in Node),
// sanitize via the regex fallback. Static: no live comments, no mermaid SVG.
export async function buildStandalone(srcPath) {
  const source = readFileSync(srcPath, "utf8");
  const css = readFileSync(join(PKG, "web", "viewer.css"), "utf8");
  const { marked } = await import(pathToFileURL(join(PKG, "vendor", "marked.esm.js")).href);
  const { blocks, meta } = parse(source);
  // markdown output is sanitized too — marked passes raw HTML through, and
  // richtext is the biggest injection surface in a shared/archived export.
  const body = render(blocks, { md: (s) => sanitizeHtml(marked.parse(s)) });
  return `<!doctype html><html data-theme="dark"><head><meta charset="utf-8">
<title>${meta.title || "Visual plan"}</title><style>${css}</style></head>
<body><div class="topbar"><span class="title">${meta.title || ""}</span></div>
<main class="doc">${body}</main></body></html>`;
}

// ---- baked-in dependency guard (runs free inside the already-spawned Node;
// no extra process, no tokens; only the CLI path triggers it, not test imports) ----
function checkEnv() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 18) {
    console.error(`codevista-viewer needs Node >= 18 (found ${process.version}).`);
    process.exit(1);
  }
  const required = ["marked.esm.js", "purify.es.mjs"];
  const missing = required.filter((f) => !existsSync(join(PKG, "vendor", f)));
  if (missing.length) {
    console.error(`Missing vendored libs: ${missing.join(", ")}.`);
    console.error(`Run \`npm run setup\` once (needs network) to fetch them, then retry.`);
    process.exit(1);
  }
}

// ---- CLI ----
const HELP = `Usage: server.js <source> [options]

Serve a CodeVista plan/recap file as a live, commentable view on 127.0.0.1,
or export it to a single self-contained HTML file.

Arguments:
  <source>             Path to the document: plans/<slug>/plan.md or
                       recaps/<slug>/recap.md (kind is inferred from the
                       basename; anything else is a plan unless --kind says
                       otherwise).

Options:
  --open               Open the served URL in your default browser.
  --export <file>      Write a standalone HTML file and exit (no server).
  --set-status <id>=<s> Set a :::task's status (pending|running|done|blocked) and exit.
  --port <n>           Preferred port (default: 4321; auto-increments if taken).
  --host <addr>        Bind address (default: 127.0.0.1).
  --kind <plan|recap>  Override document kind (default: inferred from filename).
  -h, --help           Show this help and exit.

Examples:
  server.js plans/feature/plan.md --open
  server.js recaps/branch/recap.md --port 5000
  server.js plans/feature/plan.md --export plan.html
  server.js plans/feature/plan.md --set-status auth-mw=done

Exit codes: 0 success · 1 bad usage / missing file / unmet runtime requirement.`;

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);
    process.exit(0);
  }
  checkEnv();
  const srcPath = argv.find((a) => !a.startsWith("--"));
  if (!srcPath) {
    console.error(HELP);
    process.exit(1);
  }
  const get = (flag, def) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
  };
  const host = get("--host", "127.0.0.1");
  const wantPort = parseInt(get("--port", "4321"), 10);
  const kind = get("--kind", inferKind(srcPath));

  const exportTo = get("--export", null);
  if (exportTo) {
    buildStandalone(resolve(srcPath)).then((html) => {
      writeFileSync(resolve(exportTo), html);
      console.log(`Exported standalone: ${resolve(exportTo)}`);
      process.exit(0);
    }).catch((err) => {
      console.error(`--export failed: ${err.message}`);
      process.exit(1);
    });
    return;
  }

  const setStatus = get("--set-status", null);
  if (setStatus) {
    const eq = setStatus.indexOf("=");
    const taskId = eq >= 0 ? setStatus.slice(0, eq) : "";
    const status = eq >= 0 ? setStatus.slice(eq + 1) : "";
    const ALLOWED = ["pending", "running", "done", "blocked"];
    if (!taskId || !ALLOWED.includes(status)) {
      console.error(`--set-status expects <task-id>=<${ALLOWED.join("|")}>`);
      process.exit(1);
    }
    const abs = resolve(srcPath);
    const source = readFileSync(abs, "utf8");
    if (duplicateIds(source).includes(taskId)) {
      console.error(`--set-status: id "${taskId}" is not unique — more than one block uses it. Give each block a unique id.`);
      process.exit(1);
    }
    const updated = applyStatus(source, { taskId, status });
    if (updated === null) {
      console.error(`--set-status: no :::task with id "${taskId}" in ${abs}`);
      process.exit(1);
    }
    writeFileSync(abs, updated);
    console.log(`Set ${taskId} -> ${status} in ${abs}`);
    process.exit(0);
  }

  if (existsSync(resolve(srcPath))) {
    const dups = duplicateIds(readFileSync(resolve(srcPath), "utf8"));
    if (dups.length)
      console.warn(`⚠ duplicate block id(s): ${dups.join(", ")} — comments and --set-status target the first match. Make each id unique.`);
  }

  const server = createServer({ srcPath: resolve(srcPath), kind });

  const tryListen = (port, attempts) => {
    const onError = (err) => {
      if (err.code === "EADDRINUSE" && attempts > 0) tryListen(port + 1, attempts - 1);
      else { console.error(err.message); process.exit(1); }
    };
    server.once("error", onError);
    server.listen(port, host, () => {
      // don't leave the retry handler armed on a live server — a later runtime
      // 'error' must not call listen() again on an already-listening server.
      server.removeListener("error", onError);
      const url = `http://${host}:${port}`;
      console.log(`Visual ${kind} ready: ${url}`);
      console.log(`Source:   ${resolve(srcPath)}`);
      console.log(`Comments: ${resolveCommentsPath(srcPath)}`);
      if (argv.includes("--open")) openBrowser(url);
    });
  };
  tryListen(wantPort, 15);
}

// pathToFileURL handles percent-encoding (paths with spaces) and Windows drive
// letters — naive `file://${argv[1]}` comparison silently skips main() on both.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
