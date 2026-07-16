// Conservative HTML-fragment sanitizer used by render() in Node and as a
// browser fallback when DOMPurify is unavailable. Author HTML is trusted-ish
// (written by the coding agent, local only) but we still strip executable bits.
const BLOCKED_TAGS = /<\/?(?:script|style|html|head|body|iframe|object|embed|link|meta)\b[^>]*>/gi;
// Same blocklist, but KEEPS <style> — used for prototype bodies, which are real
// HTML+CSS rendered inside a sandboxed iframe (custom CSS is the whole point).
const BLOCKED_TAGS_KEEP_STYLE = /<\/?(?:script|html|head|body|iframe|object|embed|link|meta)\b[^>]*>/gi;
const EVENT_ATTRS = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_URLS = /\s(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi;

export function sanitizeHtml(html) {
  if (typeof html !== "string") return "";
  return html
    .replace(BLOCKED_TAGS, "")
    .replace(EVENT_ATTRS, "")
    .replace(JS_URLS, " $1=\"#\"");
}

// Prototype-body sanitizer: keeps <style> so authored CSS survives, but still
// strips scripts, event handlers, javascript: URLs, and framing/embedding tags.
// "Static CSS only" is enforced here structurally — the sandboxed, script-less
// iframe it renders into is the second line of defense, not the only one.
export function sanitizePrototype(html) {
  if (typeof html !== "string") return "";
  return html
    .replace(BLOCKED_TAGS_KEEP_STYLE, "")
    .replace(EVENT_ATTRS, "")
    .replace(JS_URLS, " $1=\"#\"");
}
