#!/usr/bin/env node
// Wrapper around `npm audit` that only fails on advisories we haven't already dealt with.
//
// WHY THIS EXISTS
// `npm audit` matches on the version number in package.json, not on file contents. Three of our
// dependencies are fixed in-tree with patch-package, so audit still reports them forever — and
// they cannot be fixed by upgrading:
//   * image-size            — vulnerable range is `<=2.0.2`, and 2.0.2 IS the latest published
//                             version. NO safe version exists to upgrade to.
//   * decode-uri-component  — the only patched release (0.5.0) is ESM-only; its consumer
//                             query-string@7.1.3 is CommonJS and `require()`s it.
//   * uuid                  — the fix needs a v7 -> v11 major that `xcode` can't take.
// That leaves a permanent wall of known findings, which is exactly how a NEW vulnerability gets
// missed. This script hides only the four we've actually patched and shouts about anything else.
//
// SAFETY PROPERTY: an entry is only ignored while its patch file is still present. Delete a patch
// and its advisory immediately counts as unhandled again — the suppression can never outlive the
// fix that justifies it.
//
// A second, narrower list (ACCEPTED) covers advisories with NO fixed release that the app can't
// reach. There's no patch to tie those to, so each is honoured only while the installed version,
// the set of packages that require it, and the review date all still match what was reviewed.
//
// Usage: npm run audit:check   (exit 0 = nothing new, exit 1 = something needs a look)
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// Advisories that are already fixed in-tree. Keyed by GHSA URL, which is stable.
const HANDLED = [
  {
    url: "https://github.com/advisories/GHSA-vcc3-ghjq-m6fr",
    package: "decode-uri-component",
    patch: "patches/decode-uri-component+0.2.2.patch",
    note: "Exponential decode replaced with upstream 0.5.0's linear O(n) scan (kept CJS).",
  },
  {
    url: "https://github.com/advisories/GHSA-w3rx-r6r6-pgpr",
    package: "image-size",
    patch: "patches/image-size+1.2.1.patch",
    note: "ICNS: entry length 0 froze the offset; now advances by >= one 8-byte entry header.",
  },
  {
    url: "https://github.com/advisories/GHSA-5p2g-fcmc-qvqq",
    package: "image-size",
    patch: "patches/image-size+1.2.1.patch",
    note: "JXL: 'jxlp' box of size 0 froze the offset; now always steps past the consumed box.",
  },
  {
    url: "https://github.com/advisories/GHSA-w5hq-g745-h8pq",
    package: "uuid",
    patch: "patches/uuid+7.0.3.patch",
    note: "v3/v5 wrote 16 bytes with no bounds check; added 11.1.1's RangeError guard.",
  },
];

// Advisories with no fixed release, reviewed and accepted because the app can't reach the
// vulnerable code. Honoured only while ALL of these still hold — otherwise it fails as unhandled:
//   * every installed copy is the reviewed `version` (an upgrade or new copy means re-review);
//   * it is still required only by `onlyRequiredBy` (a new consumer could reach the code);
//   * today is before `reviewBy` (the acceptance expires and must be looked at again).
const ACCEPTED = [
  {
    url: "https://github.com/advisories/GHSA-86w9-cpqp-85rv",
    package: "node-forge",
    version: "1.4.0",
    onlyRequiredBy: ["@expo/cli", "@expo/code-signing-certificates"],
    reviewBy: "2027-01-01",
    note:
      "RSA PKCS#1 v1.5 signature check. Only the Expo CLI uses it (expo-updates code signing, a " +
      "build-time tool); the app doesn't use expo-updates and never bundles node-forge. No fixed release.",
  },
  {
    url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
    package: "braces",
    version: "3.0.3",
    onlyRequiredBy: ["micromatch"],
    reviewBy: "2027-01-01",
    note:
      "Stack exhaustion on deeply nested glob patterns. Only reached through micromatch in build " +
      "tools (Metro's file map, patch-package); patterns come from config, never from users, and " +
      "none of it is bundled into the app. No fixed release (3.0.3 is latest).",
  },
];

// `npm audit` exits non-zero when it finds anything, so capture rather than throw.
function runAudit() {
  try {
    // Run through the shell (static command, no user input) so it resolves `npm` vs
    // `npm.cmd` itself — modern Node refuses to spawn `.cmd` files without a shell.
    return execSync("npm audit --json", {
      cwd: projectRoot,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    if (error.stdout) return error.stdout;
    throw error;
  }
}

let report;
try {
  report = JSON.parse(runAudit());
} catch (error) {
  console.error("audit:check — could not run or parse `npm audit`:", error.message);
  process.exit(1);
}

// Collapse npm's per-dependency-path entries into distinct advisories. npm reports the same
// advisory once per route through the tree, which is why 4 real findings read as "17".
const found = new Map();
for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vulnerability.via ?? []) {
    if (typeof via === "object" && via.url) {
      found.set(via.url, { name: via.name, severity: via.severity, title: via.title, range: via.range });
    }
  }
}

// Installed versions and dependents of a package, read from package-lock.json.
const lockPackages = JSON.parse(readFileSync(join(projectRoot, "package-lock.json"), "utf8")).packages ?? {};
const nameOf = (lockPath) => lockPath.slice(lockPath.lastIndexOf("node_modules/") + "node_modules/".length);
function installedVersions(name) {
  return [
    ...new Set(
      Object.entries(lockPackages)
        .filter(([lockPath]) => nameOf(lockPath) === name)
        .map(([, pkg]) => pkg.version),
    ),
  ];
}
function requiredBy(name) {
  const dependents = new Set();
  for (const [lockPath, pkg] of Object.entries(lockPackages)) {
    const deps = { ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies };
    if (name in deps) dependents.add(lockPath === "" ? "(this app)" : nameOf(lockPath));
  }
  return [...dependents];
}

// Why an ACCEPTED entry no longer holds, or null while it still does.
function acceptanceProblem(entry) {
  const versions = installedVersions(entry.package);
  if (versions.some((v) => v !== entry.version)) {
    return `reviewed version is ${entry.version}, installed: ${versions.join(", ")}`;
  }
  const extra = requiredBy(entry.package).filter((d) => !entry.onlyRequiredBy.includes(d));
  if (extra.length > 0) return `now also required by ${extra.join(", ")}`;
  if (new Date() >= new Date(entry.reviewBy)) return `review date ${entry.reviewBy} has passed`;
  return null;
}

const handledByUrl = new Map(HANDLED.map((entry) => [entry.url, entry]));
const acceptedByUrl = new Map(ACCEPTED.map((entry) => [entry.url, entry]));
const unhandled = [];
const suppressed = [];
const accepted = [];
const staleSuppression = [];

for (const [url, advisory] of found) {
  const acceptedEntry = acceptedByUrl.get(url);
  if (acceptedEntry) {
    const problem = acceptanceProblem(acceptedEntry);
    if (problem) unhandled.push({ url, ...advisory, acceptanceProblem: problem });
    else accepted.push({ url, ...advisory, ...acceptedEntry });
    continue;
  }
  const entry = handledByUrl.get(url);
  if (!entry) {
    unhandled.push({ url, ...advisory });
    continue;
  }
  // The allowlist is only honoured while the patch that fixes it is still on disk.
  if (!existsSync(join(projectRoot, entry.patch))) {
    unhandled.push({ url, ...advisory, missingPatch: entry.patch });
    continue;
  }
  suppressed.push({ url, ...advisory, ...entry });
}

// An allowlisted advisory that no longer appears means upstream shipped a real fix — the patch
// can probably be dropped at the next dependency bump.
for (const entry of HANDLED) {
  if (!found.has(entry.url)) staleSuppression.push(entry);
}
const staleAcceptance = ACCEPTED.filter((entry) => !found.has(entry.url));

const totalPaths = Object.keys(report.vulnerabilities ?? {}).length;
console.log(`audit:check — ${found.size} distinct advisories across ${totalPaths} dependency paths\n`);

if (suppressed.length > 0) {
  console.log(`  Already fixed in-tree (${suppressed.length}) — npm still lists these because it`);
  console.log("  matches version numbers, not file contents:");
  for (const item of suppressed) {
    console.log(`    · ${item.severity.padEnd(8)} ${item.name} — ${item.note}`);
    console.log(`      ${item.patch}`);
  }
  console.log("");
}

if (accepted.length > 0) {
  console.log(`  Accepted risk (${accepted.length}) — no fixed release; reviewed, not reachable by the app:`);
  for (const item of accepted) {
    console.log(`    · ${item.severity.padEnd(8)} ${item.name} ${item.version} — ${item.note}`);
    console.log(`      required only by ${item.onlyRequiredBy.join(", ")} · review by ${item.reviewBy}`);
  }
  console.log("");
}

if (staleAcceptance.length > 0) {
  console.log(`  No longer reported (${staleAcceptance.length}) — a fixed release may be installed;`);
  console.log("  drop these ACCEPTED entries:");
  for (const entry of staleAcceptance) console.log(`    · ${entry.package} — ${entry.url}`);
  console.log("");
}

if (staleSuppression.length > 0) {
  console.log(`  No longer reported (${staleSuppression.length}) — upstream may have shipped a real fix;`);
  console.log("  consider dropping the patch and this allowlist entry at the next upgrade:");
  for (const entry of staleSuppression) console.log(`    · ${entry.package} — ${entry.patch}`);
  console.log("");
}

if (unhandled.length > 0) {
  console.log(`  NEW / UNHANDLED (${unhandled.length}) — these need a decision:`);
  for (const item of unhandled) {
    console.log(`    · ${item.severity.padEnd(8)} ${item.name}  ${item.range}`);
    console.log(`      ${item.title}`);
    console.log(`      ${item.url}`);
    if (item.acceptanceProblem)
      console.log(`      ^ was accepted, but no longer holds: ${item.acceptanceProblem} — re-review it`);
    if (item.missingPatch) {
      console.log(`      ^ was allowlisted, but its patch is MISSING: ${item.missingPatch}`);
      console.log("        Restore the patch (npm ci) — the code is currently NOT fixed.");
    }
  }
  console.log("\nFAIL — unhandled advisories above.");
  process.exit(1);
}

console.log("PASS — no new advisories.");
