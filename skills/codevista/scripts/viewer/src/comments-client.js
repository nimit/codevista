// src/comments-client.js  (browser only)
async function getComments() {
  const r = await fetch("/comments");
  return r.ok ? r.json() : [];
}
async function postComment(c) {
  await fetch("/comments", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(c),
  });
}
function newId() { return "c_" + Math.random().toString(36).slice(2, 10); }

export async function mountComments(root) {
  const comments = await getComments();
  const byBlock = {};
  for (const c of comments) (byBlock[c.blockId] = byBlock[c.blockId] || []).push(c);

  root.querySelectorAll(".block").forEach((block) => {
    const id = block.dataset.blockId;
    const tab = document.createElement("button");
    tab.className = "comment-tab";
    const existing = byBlock[id] || [];
    tab.textContent = existing.length ? String(existing.length) : "+";
    if (existing.length) block.classList.add("has-comments");
    tab.title = "Comment on this block";
    tab.onclick = () => openComposer(block, id, existing);
    block.appendChild(tab);

    if (existing.length) {
      const list = document.createElement("div");
      list.className = "comment-list";
      list.innerHTML = existing.map((c) =>
        `<div class="comment ${c.status}"><div class="c-text"></div>
         <div class="c-meta"><span class="c-tag">${c.target === "agent" ? "For agent" : "Note"}</span>${c.status === "resolved" ? '<span class="c-resolved">Resolved</span>' : ""}</div></div>`
      ).join("");
      // set text safely
      list.querySelectorAll(".c-text").forEach((el, i) => (el.textContent = existing[i].text));
      block.appendChild(list);
    }
  });

  function openComposer(block, blockId, existing) {
    const box = document.createElement("div");
    box.className = "comment-composer wf-card";
    const sel = window.getSelection && String(window.getSelection());
    box.innerHTML =
      `<textarea rows="3" placeholder="What should change here?"></textarea>
       <div class="cc-row">
         <label class="cc-toggle"><input type="checkbox" checked> Send to agent</label>
         <div class="cc-actions">
           <button class="c-cancel">Cancel</button>
           <button class="primary c-save">Comment</button>
         </div>
       </div>`;
    block.appendChild(box);
    box.querySelector("textarea").focus();
    box.querySelector(".c-cancel").onclick = () => box.remove();
    box.querySelector(".c-save").onclick = async () => {
      const text = box.querySelector("textarea").value.trim();
      if (!text) return;
      const c = {
        id: newId(), blockId, text, status: "open",
        target: box.querySelector("input").checked ? "agent" : "human",
        quote: sel && sel.length < 200 ? sel : "", createdAt: Date.now(),
      };
      await postComment(c);
      location.reload();
    };
  }
}
