// Conservative HTML-fragment sanitizer used by render() in Node and as a
// browser fallback when DOMPurify is unavailable. Author HTML is trusted-ish
// (written by the coding agent, local only) but we still strip executable bits.
const BLOCKED_TAGS = /<\/?(?:script|style|html|head|body|iframe|object|embed|link|meta)\b[^>]*>/gi;
const EVENT_ATTRS = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_URLS = /\s(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi;

export function sanitizeHtml(html) {
  if (typeof html !== "string") return "";
  return html
    .replace(BLOCKED_TAGS, "")
    .replace(EVENT_ATTRS, "")
    .replace(JS_URLS, " $1=\"#\"");
}
