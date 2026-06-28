// src/viewer-main.js  (browser entry)
import { parse } from "/src/parse.js";
import { render } from "/src/render.js";
import { mountComments } from "/src/comments-client.js";
import { mountAnswers } from "/src/answers-client.js";
import { marked } from "/vendor/marked.esm.js";
import DOMPurify from "/vendor/purify.es.mjs";

// mermaid is online-only by design: it lazy-loads diagram-type chunks relative to
// its own URL, so we load it from the CDN (where those chunks live) instead of
// vendoring its multi-MB chunk tree. Loaded defensively — when offline or the CDN
// is unreachable the import simply rejects, `.mermaid` blocks keep showing their
// source text, and the page still works. marked + DOMPurify stay vendored/offline.
const MERMAID_URL = "https://cdn.jsdelivr.net/npm/mermaid@11.15.0/dist/mermaid.esm.min.mjs";
let mermaid = null;
try {
  mermaid = (await import(MERMAID_URL)).default;
} catch { /* offline or CDN unreachable; diagrams degrade to source text */ }

const doc = document.getElementById("doc");
const md = (s) => marked.parse(s);
const sanitize = (h) => DOMPurify.sanitize(h, { ADD_ATTR: ["data-icon", "data-primary", "target"] });

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem("lv-theme", t);
  try { mermaid?.initialize({ startOnLoad: false, theme: t === "dark" ? "dark" : "default" }); } catch { /* ignore */ }
}

async function load(flash) {
  // /content yields { source } on success, or an error object ({ error }) with no
  // `source` when the file is momentarily unreadable — e.g. a live-reload racing a
  // rewrite, or the file not finished being written on first open. Don't feed that
  // into parse() (parse(undefined) used to crash the whole page); keep whatever is
  // already shown and retry shortly so the view self-heals once the file is back.
  let data = {};
  try { data = await (await fetch("/content")).json(); } catch { /* network blip */ }
  if (typeof data.source !== "string") {
    if (!doc.dataset.loaded) doc.innerHTML = '<p class="load-note">Waiting for source…</p>';
    clearTimeout(load._retry);
    load._retry = setTimeout(() => load(flash), 500);
    return;
  }
  doc.dataset.loaded = "1";
  const { source } = data;
  const { meta, blocks } = parse(source);
  document.getElementById("title").textContent = meta.title || "Visual plan";
  document.title = meta.title || "Visual plan";
  doc.innerHTML = render(blocks, { md, sanitize });
  if (flash) {
    doc.classList.add("reload-flash");
    setTimeout(() => doc.classList.remove("reload-flash"), 600);
  }
  if (mermaid) {
    try { await mermaid.run({ querySelector: ".mermaid" }); } catch { /* degrade to source */ }
  }
  wireTabs();
  await mountComments(doc);
  mountAnswers(doc);
}

function wireTabs() {
  doc.querySelectorAll(".tabs").forEach((tabs) => {
    tabs.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.onclick = () => {
        const i = btn.dataset.tab;
        tabs.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === i));
        tabs.querySelectorAll(".tab-pane").forEach((p) => p.classList.toggle("active", p.dataset.tab === i));
      };
    });
  });
}

document.getElementById("theme").onclick = () =>
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");

applyTheme(localStorage.getItem("lv-theme") || "dark");
load(false);

// live reload via SSE
const es = new EventSource("/events");
es.addEventListener("reload", () => {
  // Our own answer writes trigger a reload; skip exactly one so the optimistic
  // highlight doesn't flicker. External edits (the agent) still live-reload.
  if (window.__lvSkipReload) { window.__lvSkipReload = false; return; }
  load(true);
});
