// src/attrs.js — quote-aware single-line attribute editing.
// Pure and browser-safe (string ops only). Used by the server's write-back
// mutators and by parse.js's id injection. Replaces the old substring-regex
// editing so an attr edit can never match a key that appears inside another
// attribute's quoted value (e.g. status= inside a title="…status=…").

const WORD = /[\w-]/;
const WS = /\s/;

// Tokenize the attribute region of a directive/fence/list line. Walks the line
// respecting quotes: a bare quoted string (a question/test description, not a
// key=value) is consumed opaquely, and non-word chars (`:`, backticks, `-`) are
// skipped. Returns real attribute tokens with their [start, end) span.
export function attrTokens(line) {
  const tokens = [];
  let i = 0;
  const n = line.length;
  while (i < n) {
    while (i < n && WS.test(line[i])) i++;
    if (i >= n) break;
    if (line[i] === '"' || line[i] === "'") {   // bare quoted string — opaque
      const q = line[i++];
      while (i < n && line[i] !== q) i++;
      if (i < n) i++;                            // closing quote
      continue;
    }
    const start = i;
    let key = "";
    while (i < n && WORD.test(line[i])) key += line[i++];
    if (!key) { i++; continue; }                 // punctuation (`:`, backtick) — skip
    let hasValue = false;
    if (line[i] === "=") {
      hasValue = true;
      i++;
      if (line[i] === '"' || line[i] === "'") {
        const q = line[i++];
        while (i < n && line[i] !== q) i++;
        if (i < n) i++;
      } else {
        while (i < n && !WS.test(line[i])) i++;
      }
    }
    tokens.push({ key, hasValue, start, end: i });
  }
  return tokens;
}

// Set/replace/remove `key`. Empty string value removes the attribute. `quoted`
// wraps the value in double quotes (default); pass false for bare tokens
// (status=, id=). Only the target token's span is touched — the rest of the
// line is preserved verbatim.
export function setLineAttr(line, key, value, quoted = true) {
  const tok = attrTokens(line).find((t) => t.key === key);
  if (value === "") {
    if (!tok) return line;
    let s = tok.start;
    while (s > 0 && WS.test(line[s - 1])) s--;    // eat the leading space too
    return line.slice(0, s) + line.slice(tok.end);
  }
  const rendered = `${key}=${quoted ? `"${value}"` : value}`;
  if (tok) return line.slice(0, tok.start) + rendered + line.slice(tok.end);
  return `${line.replace(/\s+$/, "")} ${rendered}`;
}

// Add or remove a bare word flag (`selected`, `skip`). A flag is a token with no
// `=value`, so a matching word inside a quoted string is never affected.
export function setLineFlag(line, flag, on) {
  const tok = attrTokens(line).find((t) => t.key === flag && !t.hasValue);
  if (on) return tok ? line : `${line.replace(/\s+$/, "")} ${flag}`;
  if (!tok) return line;
  let s = tok.start;
  while (s > 0 && WS.test(line[s - 1])) s--;
  return line.slice(0, s) + line.slice(tok.end);
}
