import { test } from "node:test";
import assert from "node:assert/strict";
import { attrTokens, setLineAttr, setLineFlag } from "../src/attrs.js";

test("attrTokens skips :::prefix and bare quoted strings, finds real attrs", () => {
  const toks = attrTokens(':::task id=x title="rework the status=done path" status=pending');
  const keys = toks.map((t) => t.key);
  assert.ok(keys.includes("id"));
  assert.ok(keys.includes("title"));
  assert.ok(keys.includes("status"));
  // the `status=done` inside the quoted title is NOT a token
  assert.equal(keys.filter((k) => k === "status").length, 1);
});

test("setLineAttr replaces the real status token, not a substring in a quoted value", () => {
  const line = ':::task id=x title="rework the status=done path" status=pending';
  const out = setLineAttr(line, "status", "done", false);
  assert.equal(out, ':::task id=x title="rework the status=done path" status=done');
});

test("setLineAttr appends when the attr is absent (bare)", () => {
  assert.equal(setLineAttr(":::task id=t2", "status", "done", false), ":::task id=t2 status=done");
});

test("setLineAttr writes and removes a quoted attr", () => {
  assert.equal(setLineAttr('q single "Q?"', "answer", "yes"), 'q single "Q?" answer="yes"');
  assert.equal(setLineAttr('q single "Q?" answer="yes"', "answer", ""), 'q single "Q?"');
});

test("setLineAttr does not match a key inside another attr's quoted value", () => {
  const line = 'q single "Which id?" answer="the id=42 one"';
  // setting answer must replace the answer token, leaving the quoted text intact structure
  assert.equal(setLineAttr(line, "answer", "x"), 'q single "Which id?" answer="x"');
});

test("setLineFlag toggles a bare flag without touching a matching word inside a quoted string", () => {
  assert.equal(setLineFlag('- "skip me"', "skip", true), '- "skip me" skip');
  assert.equal(setLineFlag('- "skip me" skip', "skip", false), '- "skip me"');
  assert.equal(setLineFlag('- "A"', "selected", true), '- "A" selected');
  assert.equal(setLineFlag('- "A" selected', "selected", false), '- "A"');
});
