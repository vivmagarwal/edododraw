#!/usr/bin/env node
/**
 * Publish guard: npm and git must never drift apart. Runs first in
 * prepublishOnly, so it fails fast before the build. `npm publish` refuses
 * unless the working tree is clean, HEAD is already on origin/main, and the
 * tag `v<version>` exists on origin and points at HEAD — so whatever lands on
 * npm is a commit anyone can check out by its tag. `npm run release`
 * (scripts/release.sh) does those steps in order.
 *
 * Escape hatch, for emergencies only: EDD_RELEASE_UNCHECKED=1.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const tag = `v${version}`;

const fail = (msg) => {
  console.error(`✗ check-release: ${msg}`);
  process.exit(1);
};
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

if (process.env.EDD_RELEASE_UNCHECKED === "1") {
  console.warn(`! check-release: skipped (EDD_RELEASE_UNCHECKED=1) — ${tag} may not match a pushed commit`);
  process.exit(0);
}

if (git("status", "--porcelain")) fail("the working tree has uncommitted changes — commit them first");
const head = git("rev-parse", "HEAD");
git("fetch", "--quiet", "origin", "main", "--tags");
try {
  git("merge-base", "--is-ancestor", head, "origin/main");
} catch {
  fail(`HEAD ${head.slice(0, 7)} is not on origin/main — run: git push origin main`);
}
let tagged = "";
try {
  tagged = git("rev-list", "-n", "1", `refs/tags/${tag}`);
} catch {
  fail(`no tag ${tag} — use \`npm run release\`, which tags, pushes and publishes in order`);
}
if (tagged !== head) fail(`tag ${tag} points at ${tagged.slice(0, 7)}, not HEAD ${head.slice(0, 7)}`);
const remoteTag = git("ls-remote", "--tags", "origin", `refs/tags/${tag}`);
if (!remoteTag) fail(`tag ${tag} is not on origin — run: git push origin ${tag}`);
console.log(`✓ check-release: ${tag} = ${head.slice(0, 7)}, pushed to origin`);
