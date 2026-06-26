#!/usr/bin/env node
// bin/server.js  (Node built-ins only)
import http from "node:http";
import { readFile, readFileSync, writeFileSync, existsSync, watch } from "node:fs";
import { join, dirname, resolve, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { parse, locate } from "../src/parse.js";
import { render } from "../src/render.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(__dirname, "..");           // scripts/viewer/
const STATIC_ROOTS = { "/viewer.css": join(PKG, "web", "viewer.css") };
const STATIC_DIRS = { "/src/": join(PKG, "src"), "/vendor/": join(PKG, "vendor"), "/web/": join(PKG, "web") };
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".html": "text/html", ".json": "application/json", ".svg": "image/svg+xml" };

export function resolveCommentsPath(srcPath) {
  return join(dirname(resolve(srcPath)), "comments.json");
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
// just writes what it is told. Pure + exported so it is unit-testable.
export function applyAnswer(source, { blockId, questionIndex, kind, selected = [], custom = "" }) {
  const loc = locate(source, blockId);
  if (!loc || loc.type !== "question-form") return source;
  const lines = source.split(/\r?\n/);
  const qLines = [];
  for (let i = loc.startLine; i <= loc.endLine; i++)
    if (/^q\s+(single|multi|freeform)\b/.test(lines[i])) qLines.push(i);
  const qStart = qLines[questionIndex];
  if (qStart == null) return source;
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

// Advance a :::task's status by rewriting the `status=` token on its opening
// directive line (located by id via locate()). Pure + exported so it is
// unit-testable; the CLI (--set-status) validates the allowed status set, so this
// stays faithful and writes whatever it is told. Returns source unchanged when the
// id is not a :::task block.
export function applyStatus(source, { taskId, status }) {
  const loc = locate(source, taskId);
  if (!loc || loc.type !== "task") return source;
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
      const title = (source.match(/^#\s+(.+)$/m) || [, basename(srcPath)])[1];
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
        const i = list.findIndex((x) => x.id === c.id);
        if (i >= 0) list[i] = { ...list[i], ...c }; else list.push(c);
        writeComments(srcPath, list);
        send(res, 200, JSON.stringify({ ok: true }), "application/json");
      });
      return;
    }
    if (url === "/answers" && req.method === "POST") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        let a; try { a = JSON.parse(raw); } catch { return send(res, 400, "bad json"); }
        try {
          // rewrite the answered line in place — fs.watch turns this into an SSE
          // reload (the originating tab suppresses that one; see answers-client.js).
          writeFileSync(srcPath, applyAnswer(readFileSync(srcPath, "utf8"), a));
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
  const { marked } = await import(join(PKG, "vendor", "marked.esm.js"));
  const { blocks, meta } = parse(source);
  const body = render(blocks, { md: (s) => marked.parse(s) }); // sanitize = regex fallback
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
const HELP = `Usage: server.js <source.(plan|recap).md> [options]

Serve a CodeVista plan/recap file as a live, commentable view on 127.0.0.1,
or export it to a single self-contained HTML file.

Arguments:
  <source>             Path to the .plan.md / .recap.md file to render.

Options:
  --open               Open the served URL in your default browser.
  --export <file>      Write a standalone HTML file and exit (no server).
  --set-status <id>=<s> Set a :::task's status (pending|running|done|blocked) and exit.
  --port <n>           Preferred port (default: 4321; auto-increments if taken).
  --host <addr>        Bind address (default: 127.0.0.1).
  --kind <plan|recap>  Override document kind (default: inferred from filename).
  -h, --help           Show this help and exit.

Examples:
  server.js plans/feature.plan.md --open
  server.js recaps/branch.recap.md --port 5000
  server.js plans/feature.plan.md --export plan.html
  server.js plans/feat/feat.plan.md --set-status auth-mw=done

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
  const kind = get("--kind", srcPath.endsWith(".recap.md") ? "recap" : "plan");

  const exportTo = get("--export", null);
  if (exportTo) {
    buildStandalone(resolve(srcPath)).then((html) => {
      writeFileSync(resolve(exportTo), html);
      console.log(`Exported standalone: ${resolve(exportTo)}`);
      process.exit(0);
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
    writeFileSync(abs, applyStatus(readFileSync(abs, "utf8"), { taskId, status }));
    console.log(`Set ${taskId} -> ${status} in ${abs}`);
    process.exit(0);
  }

  const server = createServer({ srcPath: resolve(srcPath), kind });

  const tryListen = (port, attempts) => {
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE" && attempts > 0) tryListen(port + 1, attempts - 1);
      else { console.error(err.message); process.exit(1); }
    });
    server.listen(port, host, () => {
      const url = `http://${host}:${port}`;
      console.log(`Visual ${kind} ready: ${url}`);
      console.log(`Source:   ${resolve(srcPath)}`);
      console.log(`Comments: ${resolveCommentsPath(srcPath)}`);
      if (argv.includes("--open")) openBrowser(url);
    });
  };
  tryListen(wantPort, 15);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
