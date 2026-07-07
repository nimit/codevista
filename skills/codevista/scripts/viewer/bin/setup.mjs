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
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(__dirname, "..");
const VENDOR = join(PKG, "vendor");

const MAJOR = Number(process.versions.node.split(".")[0]);
if (MAJOR < 18) {
  console.error(`codevista-viewer needs Node >= 18 (found ${process.version}). Upgrade Node and re-run \`npm run setup\`.`);
  process.exit(1);
}

// Exact pinned versions AND content hashes — so "what setup fetches" == "what
// is committed", enforced, not just documented. The hashes are the same ones
// listed in vendor/README.md. Bump a version: update url + sha256 here, re-run,
// re-commit, and update vendor/README.md to match.
// mermaid is intentionally absent — the viewer loads it from a CDN at runtime.
const LIBS = [
  { file: "marked.esm.js", url: "https://cdn.jsdelivr.net/npm/marked@12.0.2/lib/marked.esm.js",
    sha256: "288515814e901ea6535521d9fb35a1329455d3d3973de8723db998536f979cf2" },
  { file: "purify.es.mjs", url: "https://cdn.jsdelivr.net/npm/dompurify@3.4.10/dist/purify.es.mjs",
    sha256: "c8fce077f2e0bcc7022e7e0e378f2565b2ca9a17d6043947ad137d33a6c11ed2" },
];

mkdirSync(VENDOR, { recursive: true });

let ok = true;
for (const lib of LIBS) {
  try {
    process.stdout.write(`fetching ${lib.file} … `);
    const res = await fetch(lib.url, { redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const digest = createHash("sha256").update(text).digest("hex");
    if (digest !== lib.sha256)
      throw new Error(`SHA-256 mismatch (got ${digest}) — CDN served different bytes than the pinned release; NOT writing it`);
    const out = join(VENDOR, lib.file);
    writeFileSync(out, text);
    const kb = (statSync(out).size / 1024).toFixed(0);
    console.log(`ok (${kb} KB, sha256 verified)`);
  } catch (err) {
    console.log(`FAILED (${err.message})`);
    ok = false;
  }
}

if (!ok) {
  console.error("\nSetup incomplete: a library could not be fetched and verified.");
  console.error("Re-run `npm run setup` on a machine with network access to cdn.jsdelivr.net.");
  console.error("(A hash mismatch after a deliberate version bump means the sha256 pins here and in vendor/README.md need updating.)");
  process.exit(1);
}

writeFileSync(
  join(VENDOR, ".setup-ok"),
  `setup completed with node ${process.version}\n` + LIBS.map((l) => `${l.file}\t${l.url}`).join("\n") + "\n"
);
console.log("\nSetup complete. Vendored libs are committed-ready under vendor/.");
