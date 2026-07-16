// src/blocks.js
const CHANGE = { "+": "added", "~": "modified", "-": "removed", ">": "renamed" };

export function parseDiff(attrs, body, id) {
  const hunks = [];
  let cur = null;
  for (const raw of body.split(/\r?\n/)) {
    if (raw.startsWith("@@")) {
      cur = { header: raw, lines: [] };
      hunks.push(cur);
      continue;
    }
    if (raw.startsWith("note@")) continue; // handled below
    if (!cur) {
      cur = { header: "", lines: [] };
      hunks.push(cur);
    }
    const kind = raw.startsWith("+") ? "add" : raw.startsWith("-") ? "del" : "ctx";
    const text = kind === "ctx" ? raw.replace(/^ /, "") : raw.slice(1);
    cur.lines.push({ kind, text });
  }
  const annotations = [];
  for (const raw of body.split(/\r?\n/)) {
    const m = raw.match(/^note@([\d-]+):\s*(.*)$/);
    if (m) annotations.push({ lines: m[1], note: m[2] });
  }
  return {
    type: "diff", id, file: attrs.file || "", lang: attrs.lang || "",
    summary: attrs.summary || "",
    hunks, annotations,
  };
}

export function parseFileTree(attrs, body, id) {
  const entries = [];
  for (const raw of body.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const indent = raw.match(/^(\s*)/)[1].length;
    const depth = Math.floor(indent / 2);
    let rest = raw.trim();
    let change = null;
    if (CHANGE[rest[0]]) {
      change = CHANGE[rest[0]];
      rest = rest.slice(1).trim();
    }
    const parts = rest.split(/\s{2,}/);
    let path = parts[0];
    const note = parts.slice(1).join("  ").trim() || undefined;
    let to;
    const ren = path.match(/^(.*?)\s*->\s*(.*)$/);
    if (ren) { path = ren[1].trim(); to = ren[2].trim(); }
    entries.push({ depth, change, path, ...(to ? { to } : {}), ...(note ? { note } : {}) });
  }
  return { type: "file-tree", id, entries };
}

export function parseDataModel(attrs, body, id) {
  const entities = [];
  let cur = null;
  for (const raw of body.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const ent = raw.match(/^entity\s+(\S+)(?:\s+\[(\w+)\])?/);
    if (ent && !raw.startsWith(" ")) {
      cur = { name: ent[1], change: ent[2] || null, fields: [] };
      entities.push(cur);
      continue;
    }
    if (!cur) continue;
    const line = raw.trim();
    const fm = line.match(/^([\w.]+):\s*([^\[\(]+?)(?:\s*\[(\w+)\])?(?:\s*\(was:\s*([^)]+)\))?(?:\s*--\s*(.*))?$/);
    if (fm) {
      cur.fields.push({
        name: fm[1], type: fm[2].trim(),
        change: fm[3] || null, was: fm[4] ? fm[4].trim() : null,
        note: fm[5] ? fm[5].trim() : null,
      });
    }
  }
  return { type: "data-model", id, entities };
}

export function parseApi(attrs, body, id) {
  const params = [], requests = [], responses = [];
  let desc = "";
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let m;
    if ((m = line.match(/^param\s+(\S+)\s+(.*)$/))) {
      const a = attrsFromTail(m[2]);
      params.push({ name: m[1], in: a.in || "query", type: a.type || "",
        change: a.change || null, was: a.was || null, note: a.note || null });
    } else if ((m = line.match(/^request\s+(.+?)\s*\|\s*(.*)$/))) {
      requests.push({ label: m[1].trim(), example: m[2].trim() });
    } else if ((m = line.match(/^response\s+(\S+)\s+(.+?)\s*\|\s*(.*)$/))) {
      responses.push({ status: m[1], label: m[2].trim(), example: m[3].trim() });
    } else if ((m = line.match(/^desc\s+(.*)$/))) {
      desc = m[1].trim();
    }
  }
  return { type: "api", id, method: attrs.method || "GET", path: attrs.path || "",
    change: attrs.change || null, deprecated: attrs.deprecated === "true",
    desc, params, requests, responses };
}

function attrsFromTail(tail) {
  // reuse parseAttrs semantics but allow `-- note` suffix; only the FIRST
  // ` -- ` starts the note, so a note may itself contain `--`.
  const split = tail.match(/^(.*?)(?:\s+--\s+(.*))?$/);
  const a = {};
  const re = /(\w+)=("([^"]*)"|'([^']*)'|(\S+))/g;
  let m;
  while ((m = re.exec(split[1]))) a[m[1]] = m[3] ?? m[4] ?? m[5];
  if (split[2]) a.note = split[2].trim();
  return a;
}

export function parseAnnotations(body) {
  const codeLines = [], annotations = [];
  for (const raw of body.split(/\r?\n/)) {
    const m = raw.match(/^note@([\d-]+):\s*(.*)$/);
    if (m) annotations.push({ lines: m[1], note: m[2] });
    else codeLines.push(raw);
  }
  return { code: codeLines.join("\n").replace(/\n+$/, ""), annotations };
}

export function parseQuestionForm(attrs, body, id) {
  const questions = [];
  let cur = null;
  for (const raw of body.split(/\r?\n/)) {
    const q = raw.match(/^q\s+(single|multi|freeform)\s+"([^"]+)"(.*)$/);
    if (q) {
      const am = q[3].match(/answer="([^"]*)"/);
      cur = { kind: q[1], text: q[2], answer: am ? am[1] : "", options: [] };
      questions.push(cur);
      continue;
    }
    const opt = raw.match(/^\s*-\s*"([^"]+)"(.*)$/);
    if (opt && cur) {
      const tail = opt[2];
      const dm = tail.match(/detail="([^"]*)"/);
      cur.options.push({
        label: opt[1], detail: dm ? dm[1] : "",
        recommended: /\brecommended\b/.test(tail),
        selected: /\bselected\b/.test(tail),
      });
    }
  }
  return { type: "question-form", id, title: attrs.title || "Open Questions", questions };
}

// A checklist of tests the plan proposes to write. Every item is KEPT (selected)
// by default; the reviewer deselects the ones that are redundant. Default-kept
// means we persist only the exceptions: a deselected item carries a bare `skip`
// flag on its line (toggled by the server's applyTestSelection), so the plain
// list stays readable. Body grammar: `- "test description" [skip]` per line.
export function parseTests(attrs, body, id) {
  const items = [];
  for (const raw of body.split(/\r?\n/)) {
    const m = raw.match(/^\s*-\s*"([^"]+)"(.*)$/);
    if (m) items.push({ text: m[1], skip: /\bskip\b/.test(m[2]) });
  }
  return { type: "tests", id, title: attrs.title || "Tests to add", items };
}

export function parseTask(attrs, body, id) {
  const fields = { title: "", outcome: "", verify: "", scope: "", constraints: "", notes: "" };
  let dependsOn = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([\w-]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "depends-on") dependsOn = val.split(/[\s,]+/).filter(Boolean);
    else if (Object.prototype.hasOwnProperty.call(fields, key)) fields[key] = val;
  }
  return {
    type: "task", id,
    status: attrs.status || "pending",
    risk: attrs.risk || "normal",
    title: fields.title, outcome: fields.outcome, verify: fields.verify,
    scope: fields.scope || null,
    dependsOn,
    constraints: fields.constraints || null,
    notes: fields.notes || null,
  };
}

export const LEAF_PARSERS = {
  diff: parseDiff,
  "file-tree": parseFileTree,
  "data-model": parseDataModel,
  api: parseApi,
  tests: parseTests,
  wireframe: (attrs, body, id) => ({
    type: "wireframe", id, surface: attrs.surface || "browser",
    label: attrs.label || "", skeleton: attrs.skeleton === "true", html: body,
  }),
  // High-fidelity static UI prototype — same device surfaces as wireframe, but the
  // body is real HTML+CSS rendered in a sandboxed iframe (see renderPrototype). The
  // body is kept raw here; sanitizing/framing happens at render so the raw fence
  // stays human-readable HTML in the plan file.
  prototype: (attrs, body, id) => ({
    type: "prototype", id, surface: attrs.surface || "browser",
    label: attrs.label || "", html: body,
  }),
  mermaid: (attrs, body, id) => ({ type: "mermaid", id, source: body }),
  diagram: (attrs, body, id) => ({ type: "diagram", id, html: body }),
  "annotated-code": (attrs, body, id) => {
    const { code, annotations } = parseAnnotations(body);
    return { type: "annotated-code", id, file: attrs.file || "",
      lang: attrs.lang || "", code, annotations };
  },
  callout: (attrs, body, id) => ({
    type: "callout", id, tone: attrs.tone || "info", md: body,
  }),
};
