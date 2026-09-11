#!/usr/bin/env node
/**
 * Publish guard: npm and git must never drift apart. Runs first in
 * prepublishOnly, so it fails fast before the build.
 *
 * - In GitHub Actions (the normal path — .github/workflows/release.yml): the
 *   run must be for the tag `v<package.json version>`.
 * - Anywhere else (a manual `npm publish`): the working tree must be clean,
 *   HEAD must already be on origin/main, and the tag `v<version>` must exist
 *   on origin and point at HEAD. So whatever lands on npm is a commit anyone
 *   can check out by its tag.
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

if (process.env.GITHUB_ACTIONS === "true") {
  if (process.env.GITHUB_REF_TYPE !== "tag" || process.env.GITHUB_REF_NAME !== tag) {
    fail(`this run is for ${process.env.GITHUB_REF_TYPE ?? "?"} '${process.env.GITHUB_REF_NAME ?? "?"}', but package.json says ${version} — push the tag ${tag}`);
  }
  console.log(`✓ check-release: publishing ${tag} from CI`);
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
  fail(`no tag ${tag} — run: git tag ${tag} && git push origin ${tag}  (pushing the tag publishes from CI, which is the preferred path)`);
}
if (tagged !== head) fail(`tag ${tag} points at ${tagged.slice(0, 7)}, not HEAD ${head.slice(0, 7)}`);
const remoteTag = git("ls-remote", "--tags", "origin", `refs/tags/${tag}`);
if (!remoteTag) fail(`tag ${tag} is not on origin — run: git push origin ${tag}`);
console.log(`✓ check-release: ${tag} = ${head.slice(0, 7)}, pushed to origin`);
