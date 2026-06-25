#!/usr/bin/env node
// bin/setup.mjs — ONE-TIME setup. Run once on a networked machine:
//   npm run setup
// Downloads the pinned, offline browser libraries (marked + DOMPurify) into
// vendor/ and writes a `.setup-ok` sentinel. After this, the renderer needs zero
// network at runtime. (mermaid is NOT vendored — the viewer loads it from a CDN
// at runtime, so mermaid diagrams are online-only; see vendor/README.md.)
// This is the only place setup touches the network; server.js never does.
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(__dirname, "..");
const VENDOR = join(PKG, "vendor");

const MAJOR = Number(process.versions.node.split(".")[0]);
if (MAJOR < 18) {
  console.error(`local-viewer needs Node >= 18 (found ${process.version}). Upgrade Node and re-run \`npm run setup\`.`);
  process.exit(1);
}

// Exact pinned versions — so "what setup fetches" == "what is committed".
// See vendor/README.md (versions + licenses + SHA-256). Bump here, re-run,
// re-commit, and update the hashes in vendor/README.md when refreshing.
// mermaid is intentionally absent — the viewer loads it from a CDN at runtime.
const LIBS = [
  { file: "marked.esm.js", url: "https://cdn.jsdelivr.net/npm/marked@12.0.2/lib/marked.esm.js", required: true },
  { file: "purify.es.mjs", url: "https://cdn.jsdelivr.net/npm/dompurify@3.4.10/dist/purify.es.mjs", required: true },
];

mkdirSync(VENDOR, { recursive: true });

let ok = true;
for (const lib of LIBS) {
  try {
    process.stdout.write(`fetching ${lib.file} … `);
    const res = await fetch(lib.url, { redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text || text.length < 200) throw new Error("suspiciously small payload");
    const out = join(VENDOR, lib.file);
    writeFileSync(out, text);
    const kb = (statSync(out).size / 1024).toFixed(0);
    console.log(`ok (${kb} KB)`);
  } catch (err) {
    console.log(`FAILED (${err.message})`);
    if (lib.required) ok = false;
    else console.log(`  ${lib.file} is optional — continuing.`);
  }
}

if (!ok) {
  console.error("\nSetup incomplete: a required library could not be fetched.");
  console.error("Re-run `npm run setup` on a machine with network access to cdn.jsdelivr.net.");
  process.exit(1);
}

writeFileSync(
  join(VENDOR, ".setup-ok"),
  `setup completed with node ${process.version}\n` + LIBS.map((l) => `${l.file}\t${l.url}`).join("\n") + "\n"
);
console.log("\nSetup complete. Vendored libs are committed-ready under vendor/.");
