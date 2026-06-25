// src/render.js
import { sanitizeHtml } from "./sanitize.js";

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function defaultMd(s) {
  // Minimal fallback used only when no markdown engine is injected (e.g. Node
  // tests that don't need real markdown). The browser injects marked.parse.
  return s
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("\n");
}

const CHANGE_GLYPH = { added: "+", modified: "~", removed: "−", renamed: "→" };

export function renderBlock(node, opts) {
  const md = opts.md || defaultMd;
  const sani = opts.sanitize || sanitizeHtml;
  switch (node.type) {
    case "richtext":
      return md(node.md);
    case "callout":
      return `<div class="callout tone-${escapeHtml(node.tone)}">${md(node.md)}</div>`;
    case "diff":
      return renderDiff(node);
    case "file-tree":
      return renderFileTree(node);
    case "wireframe":
      return renderWireframe(node, sani);
    case "diagram":
      return `<div class="diagram">${sani(node.html)}</div>`;
    case "mermaid":
      return `<div class="mermaid">${escapeHtml(node.source)}</div>`;
    case "data-model":
      return renderDataModel(node);
    case "api":
      return renderApi(node, md);
    case "annotated-code":
      return renderAnnotatedCode(node);
    case "tabs":
      return renderTabs(node, opts);
    case "columns":
      return renderColumns(node, opts);
    case "question-form":
      return renderQuestionForm(node, md);
    default:
      return `<pre>${escapeHtml(JSON.stringify(node))}</pre>`;
  }
}

function renderDiff(node) {
  const summary = node.summary
    ? `<div class="diff-summary">${escapeHtml(node.summary)}</div>` : "";
  const file = node.file
    ? `<div class="diff-file"><span data-icon="file"></span>${escapeHtml(node.file)}</div>` : "";
  const rows = node.hunks.flatMap((h) => [
    h.header ? `<div class="diff-hunk">${escapeHtml(h.header)}</div>` : "",
    ...h.lines.map((l) =>
      `<div class="diff-line diff-${l.kind}"><span class="diff-gutter">${
        l.kind === "add" ? "+" : l.kind === "del" ? "-" : " "
      }</span><code>${escapeHtml(l.text)}</code></div>`
    ),
  ]).join("");
  const ann = node.annotations.length
    ? `<ul class="diff-annotations">${node.annotations
        .map((a) => `<li><b>L${escapeHtml(a.lines)}</b> ${escapeHtml(a.note)}</li>`)
        .join("")}</ul>` : "";
  return `${file}${summary}<div class="diff diff-${node.mode}">${rows}</div>${ann}`;
}

function renderFileTree(node) {
  const items = node.entries.map((e) => {
    const cls = e.change ? `ft-change ft-${e.change}` : "ft-change ft-none";
    const glyph = e.change ? CHANGE_GLYPH[e.change] : "·";
    const to = e.to ? ` <span class="ft-arrow">→ ${escapeHtml(e.to)}</span>` : "";
    const note = e.note ? `<span class="ft-note">${escapeHtml(e.note)}</span>` : "";
    return `<div class="ft-row" style="padding-left:${e.depth * 16}px">
      <span class="${cls}">${glyph}</span>
      <span class="ft-path">${escapeHtml(e.path)}${to}</span>${note}</div>`;
  }).join("");
  return `<div class="file-tree wf-card">${items}</div>`;
}

function renderWireframe(node, sani) {
  const label = node.label
    ? `<div class="wf-frame-label">${escapeHtml(node.label)}</div>` : "";
  const chrome = surfaceChrome(node.surface);
  const skel = node.skeleton ? " is-skeleton" : "";
  return `<figure class="wf-figure">${label}
    <div class="wf-surface wf-surface-${escapeHtml(node.surface)}${skel}" data-surface="${escapeHtml(node.surface)}">
      ${chrome}
      <div class="wf-screen">${sani(node.html)}</div>
    </div></figure>`;
}

function surfaceChrome(surface) {
  if (surface === "browser")
    return `<div class="wf-chrome wf-chrome-browser"><span class="wf-dot"></span><span class="wf-dot"></span><span class="wf-dot"></span><span class="wf-addr">localhost</span></div>`;
  if (surface === "desktop")
    return `<div class="wf-chrome wf-chrome-desktop"><span class="wf-dot"></span><span class="wf-dot"></span><span class="wf-dot"></span></div>`;
  if (surface === "mobile")
    return `<div class="wf-chrome wf-chrome-mobile"><span class="wf-notch"></span></div>`;
  return "";
}

function renderDataModel(node) {
  const entities = node.entities.map((ent) => {
    const ec = ent.change ? `dm-${ent.change}` : "";
    const rows = ent.fields.map((f) => {
      const fc = f.change ? `dm-${f.change}` : "";
      const was = f.was ? `<span class="dm-was">was ${escapeHtml(f.was)}</span>` : "";
      const note = f.note ? `<span class="dm-note">${escapeHtml(f.note)}</span>` : "";
      return `<tr class="${fc}"><td class="dm-field">${escapeHtml(f.name)}</td>
        <td class="dm-type">${escapeHtml(f.type)}${was}</td><td>${note}</td></tr>`;
    }).join("");
    return `<div class="data-model wf-card ${ec}">
      <div class="dm-head"><b>${escapeHtml(ent.name)}</b>${
        ent.change ? `<span class="dm-flag">${escapeHtml(ent.change)}</span>` : ""
      }</div><table class="dm-table">${rows}</table></div>`;
  }).join("");
  return `<div class="data-model-group">${entities}</div>`;
}

function renderApi(node, md) {
  const params = node.params.map((p) =>
    `<tr class="${p.change ? "dm-" + p.change : ""}"><td><code>${escapeHtml(p.name)}</code></td>
     <td class="wf-muted">${escapeHtml(p.in)}</td><td><code>${escapeHtml(p.type)}</code>${
       p.was ? ` <span class="dm-was">was ${escapeHtml(p.was)}</span>` : ""
     }</td><td>${escapeHtml(p.note || "")}</td></tr>`).join("");
  const examples = (arr, kind) => arr.map((x) =>
    `<details class="api-json"><summary>${kind} ${escapeHtml(x.label || x.status || "")}</summary>
     <pre><code>${escapeHtml(x.example)}</code></pre></details>`).join("");
  return `<div class="api wf-card ${node.deprecated ? "is-deprecated" : ""}">
    <div class="api-head"><span class="api-method m-${escapeHtml(node.method)}">${escapeHtml(node.method)}</span>
      <code class="api-path">${escapeHtml(node.path)}</code>${
        node.change ? `<span class="dm-flag">${escapeHtml(node.change)}</span>` : ""
      }</div>
    ${node.desc ? `<div class="api-desc">${md(node.desc)}</div>` : ""}
    ${params ? `<table class="dm-table"><thead><tr><th>param</th><th>in</th><th>type</th><th>note</th></tr></thead><tbody>${params}</tbody></table>` : ""}
    ${examples(node.requests, "request")}
    ${examples(node.responses, "response")}
  </div>`;
}

function renderAnnotatedCode(node) {
  const lines = node.code.split(/\r?\n/);
  const annByLine = {};
  for (const a of node.annotations) {
    const start = parseInt(String(a.lines).split("-")[0], 10);
    (annByLine[start] = annByLine[start] || []).push(a.note);
  }
  const rows = lines.map((ln, i) => {
    const n = i + 1;
    const note = annByLine[n]
      ? `<aside class="ac-note">${annByLine[n].map(escapeHtml).join("<br>")}</aside>` : "";
    const has = annByLine[n] ? " has-note" : "";
    return `<div class="ac-row${has}"><span class="ac-num">${n}</span><code>${escapeHtml(ln)}</code>${note}</div>`;
  }).join("");
  return `<div class="annotated-code wf-card">
    ${node.file ? `<div class="diff-file">${escapeHtml(node.file)}</div>` : ""}
    <div class="ac-body">${rows}</div></div>`;
}

function renderTabs(node, opts) {
  const heads = node.tabs.map((t, i) =>
    `<button class="tab-btn${i === 0 ? " active" : ""}" data-tab="${i}">${escapeHtml(t.label)}</button>`).join("");
  const panes = node.tabs.map((t, i) =>
    `<div class="tab-pane${i === 0 ? " active" : ""}" data-tab="${i}">${
      t.blocks.map((b) => renderBlock(b, opts)).join("")
    }</div>`).join("");
  return `<div class="tabs"><div class="tab-bar">${heads}</div><div class="tab-body">${panes}</div></div>`;
}

function renderColumns(node, opts) {
  const cols = node.columns.map((c) =>
    `<div class="col"><div class="col-label">${escapeHtml(c.label)}</div>${
      c.blocks.map((b) => renderBlock(b, opts)).join("")
    }</div>`).join("");
  return `<div class="columns${node.wide ? " is-wide" : ""}">${cols}</div>`;
}

function renderQuestionForm(node, md) {
  const qs = node.questions.map((q) => {
    const opts = q.options.map((o) =>
      `<li class="${o.recommended ? "recommended" : ""}"><b>${escapeHtml(o.label)}</b>${
        o.recommended ? ' <span class="dm-flag">recommended</span>' : ""
      }${o.detail ? `<div class="wf-muted">${escapeHtml(o.detail)}</div>` : ""}</li>`).join("");
    return `<div class="qf-q"><div class="qf-text">${escapeHtml(q.text)}</div>
      <ul class="qf-options">${opts}</ul></div>`;
  }).join("");
  return `<div class="question-form wf-card"><div class="qf-title">${escapeHtml(node.title)}</div>${qs}</div>`;
}

export function render(blocks, opts = {}) {
  return blocks.map((b) =>
    `<section class="block" data-block-id="${escapeHtml(b.id)}" data-type="${escapeHtml(b.type)}">
      ${renderBlock(b, opts)}
    </section>`).join("\n");
}
