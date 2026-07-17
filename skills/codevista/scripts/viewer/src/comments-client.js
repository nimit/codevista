// src/comments-client.js  (browser only)
// Reviewer comments attach to a block by its id and live in the comments.json
// sidecar. Everything updates the DOM in place — posting, editing, resolving and
// deleting a comment all patch just the affected block, never a full page reload
// (comments.json isn't watched, so writing it triggers no SSE reload either).
async function getComments() {
  const r = await fetch("/comments");
  return r.ok ? r.json() : [];
}
// Upsert by id: a new comment appends, an existing id (edit / resolve) merges.
async function postComment(c) {
  try {
    const r = await fetch("/comments", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(c),
    });
    return r.ok;
  } catch { return false; }
}
async function deleteComment(id) {
  try {
    const r = await fetch("/comments", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, deleted: true }),
    });
    return r.ok;
  } catch { return false; }
}
function newId() { return "c_" + Math.random().toString(36).slice(2, 10); }

// Open comments whose block is no longer in the document — a rewrite dropped or
// renamed it. Such a comment can't render (mountComments only walks live
// blocks), so it would otherwise be invisible-yet-immortal: unreachable from the
// UI, yet re-read from the sidecar and fed to the agent as stale feedback every
// round. Pure so it's testable without a DOM; the caller tombstones the result.
export function orphanedComments(comments, blockIds) {
  const present = blockIds instanceof Set ? blockIds : new Set(blockIds);
  return comments.filter((c) => c.status !== "resolved" && !present.has(c.blockId));
}

export async function mountComments(root) {
  const comments = await getComments();
  const byBlock = {};
  for (const c of comments) (byBlock[c.blockId] = byBlock[c.blockId] || []).push(c);

  const present = new Set();
  root.querySelectorAll(".block").forEach((block) => {
    const id = block.dataset.blockId;
    present.add(id);
    const list = document.createElement("div");
    list.className = "comment-list";

    const tab = document.createElement("button");
    tab.className = "comment-tab";
    tab.title = "Comment on this block";

    // Per-block view state, shared by every handler so tab count and list stay
    // in sync as comments are added, edited, resolved, or removed.
    const ctx = { block, blockId: id, tab, list };
    tab.onclick = () => openComposer(ctx);

    for (const c of byBlock[id] || []) list.appendChild(buildComment(c, ctx));
    block.append(tab, list);
    refreshTab(ctx);
  });

  // Tombstone (don't delete) orphaned comments — they stay recoverable in the
  // sidecar, and the merge-by-id POST is idempotent if two tabs race here.
  await Promise.all(
    orphanedComments(comments, present).map((c) => postComment({ ...c, status: "resolved" })),
  );
}

function refreshTab(ctx) {
  const n = ctx.list.children.length;
  ctx.tab.textContent = n ? String(n) : "+";
  ctx.block.classList.toggle("has-comments", n > 0);
}

function buildComment(c, ctx) {
  const el = document.createElement("div");
  el.className = "comment " + c.status;

  const text = document.createElement("div");
  text.className = "c-text";
  text.textContent = c.text;

  const meta = document.createElement("div");
  meta.className = "c-meta";
  const agentTarget = c.target === "agent";
  const tag = document.createElement("span");
  tag.className = "c-tag" + (agentTarget ? "" : " c-tag-human");
  tag.textContent = agentTarget ? "For agent" : "Human-only";
  meta.appendChild(tag);
  if (c.status === "resolved") {
    const r = document.createElement("span");
    r.className = "c-resolved";
    r.textContent = "Resolved";
    meta.appendChild(r);
  }

  const actions = document.createElement("div");
  actions.className = "c-actions";
  const resolved = c.status === "resolved";
  actions.append(
    mkAction(resolved ? "Reopen" : "Resolve", "c-resolve", async () => {
      const next = { ...c, status: resolved ? "open" : "resolved" };
      if (await postComment(next)) el.replaceWith(buildComment(next, ctx));
    }),
    mkAction("Edit", "c-edit", () => openComposer(ctx, { existing: c, replaceEl: el })),
    mkAction("Delete", "c-delete", async () => {
      if (await deleteComment(c.id)) { el.remove(); refreshTab(ctx); }
    }),
  );
  meta.appendChild(actions);

  el.append(text, meta);
  return el;
}

function mkAction(label, cls, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "c-action " + cls;
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

// One composer for both new comments and edits. For an edit it replaces the
// comment in place and restores it on cancel; for a new one it appends to the
// block and drops on cancel. `existing` prefills text + target and reuses the id
// so the server upserts rather than duplicating.
function openComposer(ctx, { existing = null, replaceEl = null } = {}) {
  const box = document.createElement("div");
  box.className = "comment-composer wf-card";
  const sel = !existing && window.getSelection && String(window.getSelection());
  box.innerHTML =
    `<textarea rows="3" placeholder="What should change here?"></textarea>
     <div class="cc-row">
       <label class="cc-toggle" title="By default the agent acts on this comment; tick to keep it human-only"><input type="checkbox"> Human-only</label>
       <div class="cc-actions">
         <span class="cc-error" hidden>Couldn't save — try again</span>
         <button class="c-cancel">Cancel</button>
         <button class="primary c-save">${existing ? "Save" : "Comment"}</button>
       </div>
     </div>`;
  const ta = box.querySelector("textarea");
  // Comments are for the agent by default; ticking "Human-only" keeps a comment
  // off the agent's action list (target:"human").
  const humanOnly = box.querySelector("input");
  if (existing) { ta.value = existing.text; humanOnly.checked = existing.target === "human"; }

  if (replaceEl) replaceEl.replaceWith(box); else ctx.block.appendChild(box);
  ta.focus();

  box.querySelector(".c-cancel").onclick = () => {
    if (existing && replaceEl) box.replaceWith(buildComment(existing, ctx)); else box.remove();
  };
  box.querySelector(".c-save").onclick = async () => {
    const text = ta.value.trim();
    if (!text) return;
    const target = humanOnly.checked ? "human" : "agent";
    const c = existing
      ? { ...existing, text, target }
      : {
          id: newId(), blockId: ctx.blockId, text, status: "open", target,
          quote: sel && sel.length < 200 ? sel : "", createdAt: Date.now(),
        };
    // Only mutate the DOM on a confirmed write — a failed POST would otherwise
    // silently destroy the reviewer's typed feedback.
    if (await postComment(c)) {
      const fresh = buildComment(c, ctx);
      if (existing && replaceEl) box.replaceWith(fresh);
      else { box.remove(); ctx.list.appendChild(fresh); }
      refreshTab(ctx);
    } else {
      box.querySelector(".cc-error").hidden = false;
    }
  };
}
