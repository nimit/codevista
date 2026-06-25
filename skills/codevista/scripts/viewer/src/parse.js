// src/parse.js
import { LEAF_PARSERS, parseQuestionForm } from "./blocks.js";

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
  const flushMd = () => {
    if (md.join("\n").trim()) segs.push({ kind: "md", text: md.join("\n") });
    md = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dirOpen = line.match(DIR_OPEN_RE);
    if (dirOpen && dirOpen[1] !== "") {
      flushMd();
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
      segs.push({ kind: "dir", type, attrs, inner: inner.join("\n") });
      continue;
    }
    if (line.startsWith("```")) {
      const fm = line.match(FENCE_RE);
      flushMd();
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
      segs.push({ kind: "fence", type, attrs, body: body.join("\n") });
      continue;
    }
    md.push(line);
  }
  flushMd();
  return segs;
}

export function splitFrontmatter(source) {
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
