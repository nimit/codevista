// src/tests-client.js  (browser only)
// Makes the "Tests to add" checklist interactive. Every test is kept by default;
// unchecking one persists a `skip` flag to the plan file (the source of truth) via
// POST /tests. State is optimistic — the checkbox flips instantly and the awaited
// write is reverted on failure. Mirrors answers-client.js, including the one-reload
// suppression so our own write doesn't reflow the page.
async function save(t) {
  try {
    const r = await fetch("/tests", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(t),
    });
    return r.ok;
  } catch { return false; } // network error = failed save, callers revert
}

export function mountTests(root) {
  root.querySelectorAll(".tests-block").forEach((block) => {
    const blockId = block.closest(".block").dataset.blockId;
    const countEl = block.querySelector(".tests-count");
    const items = [...block.querySelectorAll(".tests-item")];
    const refreshCount = () => {
      if (!countEl) return;
      const kept = items.filter((it) => it.querySelector(".tests-check").checked).length;
      countEl.textContent = `${kept}/${items.length} kept`;
    };

    block.querySelectorAll(".tests-check").forEach((cb) =>
      cb.addEventListener("change", async () => {
        const item = cb.closest(".tests-item");
        const skip = !cb.checked;
        item.classList.toggle("is-skipped", skip); // optimistic — instant, no reload
        refreshCount();
        // Set BEFORE the POST (the server's write can beat the response back via
        // fs.watch), but clear on failure — a failed save writes nothing, so a
        // dangling flag would swallow the next real agent-edit reload.
        window.__lvSkipReload = true;
        if (!(await save({ blockId, index: Number(cb.dataset.index), skip }))) {
          window.__lvSkipReload = false;
          cb.checked = !cb.checked;                    // revert
          item.classList.toggle("is-skipped", !cb.checked);
          refreshCount();
        }
      }));
  });
}
