// src/answers-client.js  (browser only)
// Makes the Open Questions form interactive. Listed options toggle on click; a
// write-in is "added" as a selected option card via the Add button. State is
// optimistic — the awaited POST commits it to the plan file (the source of
// truth) and is reverted on failure. A custom answer is stored as answer="…"
// metadata and the listed `selected` options independently, so the client
// (which knows single vs multi) decides how they combine.
async function save(a) {
  try {
    const r = await fetch("/answers", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(a),
    });
    return r.ok;
  } catch { return false; } // network error = failed save, callers revert
}

function setPressed(q) {
  q.querySelectorAll(".qf-opt[data-opt]").forEach((b) =>
    b.setAttribute("aria-pressed", b.classList.contains("qf-selected") ? "true" : "false"));
}

function customText(q) {
  return q.querySelector(".qf-custom-opt b")?.textContent || "";
}

function buildCustomCard(text) {
  const card = document.createElement("div");
  card.className = "qf-opt qf-selected qf-custom-opt";
  const b = document.createElement("b");
  b.textContent = text;
  const rm = document.createElement("button");
  rm.type = "button";
  rm.className = "qf-remove";
  rm.title = "Remove";
  rm.setAttribute("aria-label", "Remove custom answer");
  rm.textContent = "×";
  card.append(b, rm);
  return card;
}

export function mountAnswers(root) {
  root.querySelectorAll(".question-form").forEach((form) => {
    const blockId = form.closest(".block").dataset.blockId;
    const send = async (qi) => {
      const q = form.querySelector(`.qf-q[data-q="${qi}"]`);
      // Set BEFORE the POST (the server's write can beat the response back via
      // fs.watch), but clear on failure — a failed save writes nothing, so a
      // dangling flag would swallow the next real agent-edit reload.
      window.__lvSkipReload = true;
      const ok = await save({
        blockId, questionIndex: Number(qi), kind: q.dataset.kind,
        selected: [...q.querySelectorAll(".qf-opt.qf-selected[data-opt]")].map((b) => Number(b.dataset.opt)),
        custom: customText(q),
      });
      if (!ok) window.__lvSkipReload = false;
      return ok;
    };

    // Click a listed option: single clears its siblings and drops any custom
    // card (one answer); multi just toggles and leaves the custom card.
    form.querySelectorAll(".qf-opt[data-opt]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const q = btn.closest(".qf-q");
        if (q.dataset.kind !== "multi") {
          q.querySelectorAll(".qf-opt.qf-selected[data-opt]").forEach((b) => b !== btn && b.classList.remove("qf-selected"));
          q.querySelector(".qf-custom-opt")?.remove();
        }
        btn.classList.toggle("qf-selected"); // optimistic — instant, no reload
        setPressed(q);
        if (!(await send(q.dataset.q))) {     // revert on a failed save
          btn.classList.toggle("qf-selected");
          setPressed(q);
        }
      }));

    // Add a write-in: it appears as a selected option card. For single it
    // replaces the listed pick; for multi it joins the selected set.
    form.querySelectorAll(".qf-save").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const q = btn.closest(".qf-q");
        const inp = q.querySelector(".qf-custom");
        const text = (inp.value || "").trim();
        if (!text) return;
        const opts = q.querySelector(".qf-options");
        const oldText = customText(q);
        const cleared = q.dataset.kind !== "multi"
          ? [...q.querySelectorAll(".qf-opt.qf-selected[data-opt]")] : [];
        q.querySelector(".qf-custom-opt")?.remove();
        cleared.forEach((b) => b.classList.remove("qf-selected"));
        opts.appendChild(buildCustomCard(text));
        setPressed(q);
        inp.value = "";
        if (!(await send(q.dataset.q))) { // full revert on failure
          q.querySelector(".qf-custom-opt")?.remove();
          if (oldText) opts.appendChild(buildCustomCard(oldText));
          cleared.forEach((b) => b.classList.add("qf-selected"));
          setPressed(q);
          inp.value = text;
        }
      }));

    // Remove a custom card via its × (delegated, so it works for cards added
    // optimistically and cards produced by a re-render).
    form.addEventListener("click", async (e) => {
      const rm = e.target.closest(".qf-remove");
      if (!rm) return;
      const q = rm.closest(".qf-q");
      const card = rm.closest(".qf-custom-opt");
      const text = card.querySelector("b").textContent;
      card.remove();
      if (!(await send(q.dataset.q))) // restore on failure
        q.querySelector(".qf-options").appendChild(buildCustomCard(text));
    });
  });
}
