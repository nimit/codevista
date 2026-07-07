// src/parse.js
import { LEAF_PARSERS, parseQuestionForm, parseTask } from "./blocks.js";

const FENCE_RE = /^```(\S+)?[ \t]*(.*)$/;   // ```type attrs
const DIR_OPEN_RE = /^:::(\S+)[ \t]*(.*)$/; // :::type attrs
const DIR_CLOSE_RE = /^:::\s*$/;

export function parseAttrs(tail) {
  const attrs = {};
  if (!tail) return attrs;
  const re = /(\w[\w-]*)(?:=("([^"]*)"|'([^']*)'|(\S+)))?/g;
  let m;
  while ((m = re.exec(tail))) {
    const key = m[1];
    const val = m[3] ?? m[4] ?? m[5];
    attrs[key] = val === undefined ? "true" : val;
  }
  return attrs;
}

export function tokenize(source) {
  const lines = source.split(/\r?\n/);
  const segs = [];
  let md = [];
  let mdStart = 0;
  const lastLine = Math.max(0, lines.length - 1);
  const flushMd = () => {
    if (md.join("\n").trim())
      segs.push({ kind: "md", text: md.join("\n"), startLine: mdStart, endLine: mdStart + md.length - 1 });
    md = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dirOpen = line.match(DIR_OPEN_RE);
    if (dirOpen && dirOpen[1] !== "") {
      flushMd();
      const start = i;
      const type = dirOpen[1];
      const attrs = parseAttrs(dirOpen[2]);
      const inner = [];
      i++;
      let depth = 1;
      for (; i < lines.length; i++) {
        if (DIR_OPEN_RE.test(lines[i])) depth++;
        if (DIR_CLOSE_RE.test(lines[i])) {
          depth--;
          if (depth === 0) break;
        }
        inner.push(lines[i]);
      }
      segs.push({ kind: "dir", type, attrs, inner: inner.join("\n"),
        startLine: start, endLine: Math.min(i, lastLine) });
      continue;
    }
    if (line.startsWith("```")) {
      const fm = line.match(FENCE_RE);
      flushMd();
      const start = i;
      const type = fm[1] || "";
      const attrs = parseAttrs(fm[2]);
      const body = [];
      i++;
      for (; i < lines.length; i++) {
        if (lines[i].startsWith("```")) break;
        body.push(lines[i]);
      }
      // Plain code fences (no recognized type) stay as markdown code (resolved
      // later in parse(): unknown types fall back to a fenced richtext block).
      segs.push({ kind: "fence", type, attrs, body: body.join("\n"),
        startLine: start, endLine: Math.min(i, lastLine) });
      continue;
    }
    if (md.length === 0) mdStart = i;
    md.push(line);
  }
  flushMd();
  return segs;
}

// Map a block id (the section's data-block-id) back to its absolute line span in
// `source`. Reuses the real tokenize()/id logic so spans always line up with what
// parse() produced; accounts for the frontmatter line offset. Returns null if no
// block matches. Used by the server to rewrite a single answered question line.
export function locate(source, blockId) {
  const { body } = splitFrontmatter(source);
  const offset = source.split(/\r?\n/).length - body.split(/\r?\n/).length;
  const segs = tokenize(body);
  for (let i = 0; i < segs.length; i++) {
    const id = (segs[i].attrs && segs[i].attrs.id) || `b${i}`;
    if (id === blockId)
      return { type: segs[i].type, startLine: segs[i].startLine + offset, endLine: segs[i].endLine + offset };
  }
  return null;
}

// Effective block ids (explicit `id=` attr, else positional `b<index>`) that are
// shared by more than one top-level block. Duplicate ids make id-addressed writes
// ambiguous — locate() always resolves to the FIRST match — so the CLI hard-errors
// and the server warns when any exist. Pure; mirrors the exact id logic used by
// parse()/locate() so the three always agree. (Positional ids can't collide with
// each other; only reused explicit `id=` values do.)
export function duplicateIds(source) {
  const { body } = splitFrontmatter(source);
  const segs = tokenize(body);
  const counts = new Map();
  segs.forEach((seg, i) => {
    const id = (seg.attrs && seg.attrs.id) || `b${i}`;
    counts.set(id, (counts.get(id) || 0) + 1);
  });
  return [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
}

export function splitFrontmatter(source) {
  if (typeof source !== "string") source = "";   // total on a missing/unreadable source
  const m = source.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta = { title: "", kind: "" };
  let body = source;
  if (m) {
    body = source.slice(m[0].length);
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^(\w+):\s*(.*)$/);
      if (kv) meta[kv[1]] = kv[2].trim();
    }
  }
  if (!meta.title) {
    const h = body.match(/^#\s+(.+)$/m);
    if (h) meta.title = h[1].trim();
  }
  return { meta, body };
}

const WIDE_SURFACES = new Set(["desktop", "browser"]);

function blockFromSegment(seg, id) {
  if (seg.kind === "md") return { type: "richtext", id, md: seg.text };
  if (seg.kind === "fence") {
    const fn = LEAF_PARSERS[seg.type];
    if (fn) return fn(seg.attrs, seg.body, id);
    // Unknown fence -> keep as fenced code inside richtext
    return { type: "richtext", id, md: "```" + seg.type + "\n" + seg.body + "\n```" };
  }
  // directive container
  if (seg.type === "callout") return { type: "callout", id, tone: seg.attrs.tone || "info", md: seg.inner };
  if (seg.type === "question-form") return parseQuestionForm(seg.attrs, seg.inner, id);
  if (seg.type === "task") return parseTask(seg.attrs, seg.inner, id);
  if (seg.type === "tabs" || seg.type === "columns") {
    const childSegs = tokenize(seg.inner).filter((s) => s.kind === "fence" || s.kind === "dir");
    const children = childSegs.map((cs, j) => {
      const child = blockFromSegment(cs, `${id}.${j}`);
      const label = cs.attrs.label || cs.attrs.file || cs.attrs.path || `Tab ${j + 1}`;
      return { label, surface: cs.attrs.surface, block: child };
    });
    if (seg.type === "tabs") {
      return { type: "tabs", id, tabs: children.map((c) => ({ label: c.label, blocks: [c.block] })) };
    }
    const wide = children.some((c) => WIDE_SURFACES.has(c.surface));
    return { type: "columns", id, wide, columns: children.map((c) => ({ label: c.label, blocks: [c.block] })) };
  }
  return { type: "richtext", id, md: seg.inner };
}

export function parse(source) {
  const { meta, body } = splitFrontmatter(source);
  if (!meta.kind) meta.kind = "plan";
  const segs = tokenize(body);
  const blocks = segs.map((seg, i) => {
    const explicitId = (seg.attrs && seg.attrs.id) || null;
    return blockFromSegment(seg, explicitId || `b${i}`);
  });
  return { meta, blocks };
}
