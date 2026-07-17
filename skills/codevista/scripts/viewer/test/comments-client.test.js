// test/comments-client.test.js
// The orphan-detection decision behind the auto-resolve of stale comments.
// It's a pure function so it can be exercised without a DOM (jsdom would break
// the zero-runtime-dependency invariant); mountComments only wires it to POSTs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { orphanedComments } from "../src/comments-client.js";

const mk = (id, blockId, status = "open") => ({ id, blockId, status, text: id, target: "agent" });

test("an open comment whose block left the document is orphaned", () => {
  const comments = [mk("c_1", "gone"), mk("c_2", "here")];
  const orphans = orphanedComments(comments, new Set(["here"]));
  assert.deepEqual(orphans.map((c) => c.id), ["c_1"]);
});

test("a comment on a still-present block is never orphaned", () => {
  const comments = [mk("c_1", "here")];
  assert.deepEqual(orphanedComments(comments, new Set(["here"])), []);
});

test("an already-resolved comment is left alone even when its block is gone", () => {
  const comments = [mk("c_1", "gone", "resolved")];
  assert.deepEqual(orphanedComments(comments, new Set(["here"])), []);
});

test("accepts a plain array of block ids, not just a Set", () => {
  const orphans = orphanedComments([mk("c_1", "gone")], ["here", "there"]);
  assert.deepEqual(orphans.map((c) => c.id), ["c_1"]);
});

test("no blocks present orphans every open comment", () => {
  const comments = [mk("c_1", "a"), mk("c_2", "b", "resolved"), mk("c_3", "c")];
  assert.deepEqual(orphanedComments(comments, new Set()).map((c) => c.id), ["c_1", "c_3"]);
});
