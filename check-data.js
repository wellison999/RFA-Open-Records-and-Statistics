#!/usr/bin/env node
// Sanity check for the site's embedded data. Usage: node check-data.js [path/to/index.html]
// Fails (exit code 1) if the ranking-movements history or the points breakdown is missing or stale.
// These come from the "Fives Rankings - Singles/Doubles ... .xlsm" workbooks; if build_dashboard.py can't
// find them it writes null instead of stopping, so a bad build looks fine until someone opens the page.
const fs = require("fs"), zlib = require("zlib");

const file = process.argv[2] || "index.html";
const html = fs.readFileSync(file, "utf8");
const m = html.match(/<script id="fivesdata"[^>]*>([\s\S]*?)<\/script>/);
if (!m) { console.error("FAIL: no embedded data block found in " + file); process.exit(1); }

let D;
try {
  const raw = m[1].trim();
  D = JSON.parse(raw.startsWith("{") ? raw : zlib.gunzipSync(Buffer.from(raw, "base64")).toString("utf8"));
} catch (e) { console.error("FAIL: could not decode the data block: " + e.message); process.exit(1); }

const problems = [];
for (const d of ["Singles", "Doubles"]) {
  const X = D.disc && D.disc[d];
  if (!X) { problems.push(`${d}: missing from the data`); continue; }

  // latest ranking update shown on the site (ignore the "End of season" snapshots, which sit between tournaments)
  const snaps = (X.snapshots || []).filter(s => Number.isInteger(s.t) && !/^End of/.test(s.label));
  const latest = snaps.length ? snaps[snaps.length - 1] : null;

  const U = X.updates;
  if (!U || !Array.isArray(U.updates)) problems.push(`${d}: ranking-movements history (updates) is missing`);
  else {
    if (U.updates.length < 2) problems.push(`${d}: only ${U.updates.length} ranking update(s) in the movements history`);
    if (!U.pts || Object.keys(U.pts).length === 0) problems.push(`${d}: movements history has no player points`);
    const last = U.updates[U.updates.length - 1];
    if (latest && last && last.t !== latest.t)
      problems.push(`${d}: movements history ends at ${X.tournaments[last.t]} but the latest ranking is ${latest.label}`);
  }

  const B = X.breakdown;
  if (!B || !B.players || Object.keys(B.players).length === 0) problems.push(`${d}: points breakdown is missing`);
  else {
    const bad = Object.values(B.players).filter(p => p.check === false).length;
    if (bad) problems.push(`${d}: ${bad} player(s) whose breakdown does not match their ranking points`);
  }
}

if (problems.length) {
  console.error("Site data check FAILED (" + (D.generated || "unknown build time") + "):");
  problems.forEach(p => console.error("  - " + p));
  console.error("Most likely the build could not find the latest 'Fives Rankings - ... .xlsm' workbooks. Re-run the build with them in place.");
  process.exit(1);
}
console.log("Site data check passed (" + (D.generated || "unknown build time") + ").");
