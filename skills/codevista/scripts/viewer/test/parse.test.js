// test/parse.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenize, parseAttrs, locate, splitFrontmatter, duplicateIds } from "../src/parse.js";
import { LEAF_PARSERS, parseDiff, parseFileTree, parseDataModel, parseQuestionForm, parseTask } from "../src/blocks.js";
import { parse } from "../src/parse.js";

test("parseAttrs handles bare flags, key=value, and quoted values", () => {
  const a = parseAttrs('surface=browser label="Sign in" skeleton=true');
  assert.equal(a.surface, "browser");
  assert.equal(a.label, "Sign in");
  assert.equal(a.skeleton, "true");
});

test("tokenize separates markdown, fences, and directives", () => {
  const src = [
    "# Title",
    "",
    "Some prose.",
    "",
    "```diff file=a.ts summary=\"x\"",
    "-old",
    "+new",
    "```",
    "",
    ":::columns",
    "```wireframe surface=mobile label=\"Before\"",
    "<div>a</div>",
    "```",
    ":::",
  ].join("\n");
  const segs = tokenize(src);
  assert.equal(segs[0].kind, "md");
  assert.match(segs[0].text, /# Title/);
  const fence = segs.find((s) => s.kind === "fence");
  assert.equal(fence.type, "diff");
  assert.equal(fence.attrs.file, "a.ts");
  assert.equal(fence.body, "-old\n+new");
  const dir = segs.find((s) => s.kind === "dir");
  assert.equal(dir.type, "columns");
  assert.match(dir.inner, /wireframe surface=mobile/);
});

test("parseDiff classifies +/-/context lines into hunks", () => {
  const node = parseDiff(
    { file: "auth.ts", lang: "ts", summary: "add refresh" },
    "@@ -1,2 +1,3 @@\n const a = 1\n-const b = 2\n+const b = 3\n+const c = 4",
    "d1"
  );
  assert.equal(node.type, "diff");
  assert.equal(node.file, "auth.ts");
  assert.equal(node.summary, "add refresh");
  const kinds = node.hunks[0].lines.map((l) => l.kind);
  assert.deepEqual(kinds, ["ctx", "del", "add", "add"]);
});

test("parseFileTree reads glyphs, depth, rename, and notes", () => {
  const node = parseFileTree(
    {},
    [
      "+ src/auth/session.ts   new store",
      "  ~ src/auth/login.ts   wire refresh",
      "> src/old.ts -> src/new.ts   renamed",
    ].join("\n"),
    "ft1"
  );
  assert.equal(node.entries[0].change, "added");
  assert.equal(node.entries[0].path, "src/auth/session.ts");
  assert.equal(node.entries[0].note, "new store");
  assert.equal(node.entries[1].depth, 1);
  assert.equal(node.entries[2].change, "renamed");
  assert.equal(node.entries[2].to, "src/new.ts");
});

test("parseDataModel reads entities, change flags, fields and was:", () => {
  const node = parseDataModel(
    {},
    [
      "entity Session [added]",
      "  id: uuid [pk]",
      "  userId: uuid [modified] (was: string) -- now FK",
      "entity User",
      "  email: text",
    ].join("\n"),
    "dm1"
  );
  assert.equal(node.entities.length, 2);
  assert.equal(node.entities[0].name, "Session");
  assert.equal(node.entities[0].change, "added");
  const f = node.entities[0].fields[1];
  assert.equal(f.name, "userId");
  assert.equal(f.change, "modified");
  assert.equal(f.was, "string");
  assert.equal(f.note, "now FK");
});

test("parse builds full AST with containers and stable ids", () => {
  const src = [
    "---", "title: T", "kind: plan", "---",
    "Intro prose.",
    ":::columns",
    "```wireframe surface=mobile label=\"Before\"",
    "<div>a</div>",
    "```",
    "```wireframe surface=mobile label=\"After\"",
    "<div>b</div>",
    "```",
    ":::",
  ].join("\n");
  const { meta, blocks } = parse(src);
  assert.equal(meta.title, "T");
  assert.equal(meta.kind, "plan");
  assert.equal(blocks[0].type, "richtext");
  assert.equal(blocks[1].type, "columns");
  assert.equal(blocks[1].columns.length, 2);
  assert.equal(blocks[1].columns[0].label, "Before");
  assert.equal(blocks[1].columns[0].blocks[0].type, "wireframe");
  assert.ok(blocks[1].id); // stable id present
  assert.equal(blocks[1].wide, false); // mobile is narrow
});

test("parseQuestionForm reads selected flags and the answer write-in", () => {
  const node = parseQuestionForm({ title: "Open Questions" }, [
    'q single "Lifetime?" answer="custom value"',
    '  - "30 days" recommended selected detail="d"',
    '  - "7 days" detail="e"',
    'q multi "Which?"',
    '  - "A" selected',
    '  - "B" selected',
    '  - "C"',
  ].join("\n"), "qf1");
  assert.equal(node.questions[0].answer, "custom value");
  assert.equal(node.questions[0].options[0].selected, true);
  assert.equal(node.questions[0].options[0].recommended, true);
  assert.equal(node.questions[0].options[1].selected, false);
  assert.deepEqual(node.questions[1].options.map((o) => o.selected), [true, true, false]);
});

test("locate maps a block id to its absolute source line span", () => {
  const src = [
    "---", "title: T", "kind: plan", "---", // lines 0-3
    "Intro prose.",                          // 4
    "",                                      // 5
    ':::question-form title="Open Questions"', // 6
    'q single "Q?"',                         // 7
    '  - "A"',                                // 8
    ":::",                                    // 9
  ].join("\n");
  const loc = locate(src, "b1");
  assert.equal(loc.type, "question-form");
  assert.equal(loc.startLine, 6);
  assert.equal(loc.endLine, 9);
  assert.equal(locate(src, "nope"), null);
  // no-frontmatter case keeps lines absolute (offset 0)
  const loc0 = locate(':::question-form\nq single "Q?"\n:::', "b0");
  assert.equal(loc0.startLine, 0);
  assert.equal(loc0.endLine, 2);
});

test("duplicateIds reports effective ids shared by more than one block", () => {
  const src = [
    "```annotated-code file=e.js lang=js id=dup", "x", "```",
    "",
    ":::task id=dup status=pending", "title: T", "outcome: O", "verify: V", ":::",
    "",
    ":::task id=solo status=pending", "title: S", "outcome: O", "verify: V", ":::",
  ].join("\n");
  assert.deepEqual(duplicateIds(src), ["dup"]);
  // unique explicit ids and the positional b<index> fallback never collide
  assert.deepEqual(duplicateIds("# just markdown\n\nmore prose"), []);
});

test("columns with desktop surface marks wide=true", () => {
  const src = [
    ":::columns",
    "```wireframe surface=desktop label=\"Before\"", "<div>a</div>", "```",
    "```wireframe surface=desktop label=\"After\"", "<div>b</div>", "```",
    ":::",
  ].join("\n");
  const { blocks } = parse(src);
  assert.equal(blocks[0].wide, true);
});

test("parseTask reads attrs, fields, and the depends-on list", () => {
  const node = parseTask(
    { status: "running", risk: "high" },
    [
      "title: Auth middleware rejects invalid sessions",
      "outcome: requests without a valid session get a 401",
      "verify: `npm test auth`; manually hit /api with no cookie",
      "scope: src/middleware/auth.ts",
      "depends-on: session-store, config",
      "constraints: use the existing Session type",
      "notes: the store is async",
    ].join("\n"),
    "t1"
  );
  assert.equal(node.type, "task");
  assert.equal(node.id, "t1");
  assert.equal(node.status, "running");
  assert.equal(node.risk, "high");
  assert.equal(node.title, "Auth middleware rejects invalid sessions");
  assert.equal(node.outcome, "requests without a valid session get a 401");
  assert.match(node.verify, /npm test auth/);
  assert.equal(node.scope, "src/middleware/auth.ts");
  assert.deepEqual(node.dependsOn, ["session-store", "config"]);
  assert.equal(node.constraints, "use the existing Session type");
  assert.equal(node.notes, "the store is async");
});

test("parseTask defaults status/risk and nulls absent optional fields", () => {
  const node = parseTask({}, "title: T\noutcome: O\nverify: V", "t2");
  assert.equal(node.status, "pending");
  assert.equal(node.risk, "normal");
  assert.equal(node.scope, null);
  assert.deepEqual(node.dependsOn, []);
  assert.equal(node.constraints, null);
  assert.equal(node.notes, null);
});

test("parse wires :::task directives into task nodes with stable ids", () => {
  const src = [
    ":::task id=auth-mw status=pending",
    "title: Auth middleware",
    "outcome: 401 on missing session",
    "verify: npm test auth",
    ":::",
  ].join("\n");
  const { blocks } = parse(src);
  assert.equal(blocks[0].type, "task");
  assert.equal(blocks[0].id, "auth-mw");
  assert.equal(blocks[0].status, "pending");
  assert.equal(blocks[0].title, "Auth middleware");
});

// Regression: when /content can't read the source file it returns an error
// object with no `source`, so the browser would call parse(undefined). parse()
// must stay total (never throw) on a non-string source so a transient unreadable
// file degrades to an empty doc instead of crashing the whole page.
test("parse and splitFrontmatter are total on a non-string source", () => {
  for (const bad of [undefined, null, 0, {}]) {
    assert.doesNotThrow(() => splitFrontmatter(bad), `splitFrontmatter(${bad})`);
    assert.doesNotThrow(() => parse(bad), `parse(${bad})`);
  }
  const { meta, blocks } = parse(undefined);
  assert.equal(meta.kind, "plan");
  assert.deepEqual(blocks, []);
});
