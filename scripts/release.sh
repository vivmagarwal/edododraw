#!/usr/bin/env bash
# Release the version in package.json from this machine — no CI involved:
#   verify → tag v<version> → push main + tag → npm publish → check the
#   registry → deploy the docs site.
# So npm, the git tag and the docs site always carry the same commit.
#
# Every step checks whether it is already done, so re-running after a failure
# (a declined approval, a network blip) simply resumes where it stopped.
#
#   npm version 0.17.0 --no-git-tag-version   # bump; add "## 0.17.0" to CHANGELOG.md + docs
#   git commit -am "0.17.0 — …"
#   npm run release                            # in YOUR Terminal: press Enter + Touch ID once
#
# npm auth is your `npm login` session plus the account's passkey 2FA: at the
# publish step npm prints "Authenticate your account at: …", you press Enter,
# approve with Touch ID in the browser, and the release carries on. That needs
# a real terminal, which is why this refuses to run without one. (Tokens that
# bypass 2FA are refused for publishing now, so there is no token path.)
set -euo pipefail
cd "$(dirname "$0")/.."

die() { echo "✗ release: $*" >&2; exit 1; }
step() { echo; echo "→ $*"; }

[ -t 0 ] && [ -t 1 ] || die "run this in your own Terminal — npm's 2FA approval needs one"
npm whoami >/dev/null 2>&1 || die "not logged in to npm — run: npm login"

VERSION=$(node -p "require('./package.json').version")
TAG="v$VERSION"
published() { [ "$(npm view "edododraw@$VERSION" version 2>/dev/null)" = "$VERSION" ]; }

step "checking the tree for $TAG"
[ -z "$(git status --porcelain)" ] || die "uncommitted changes — commit the release first"
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || die "not on main"
grep -q "^## $VERSION\$" CHANGELOG.md || die "CHANGELOG.md has no '## $VERSION' section"
HEAD=$(git rev-parse HEAD)

if published; then
  echo "  edododraw@$VERSION is already on npm — skipping verification and publish"
else
  step "typecheck + tests"
  npm run typecheck
  npm test
fi

step "tag $TAG"
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  [ "$(git rev-list -n 1 "$TAG")" = "$HEAD" ] || die "tag $TAG already exists on a different commit"
  echo "  already tagged"
else
  git tag -a "$TAG" -m "edododraw@$VERSION"
fi

step "push main + $TAG to GitHub"
git push origin main "refs/tags/$TAG"

if ! published; then
  step "npm publish — when npm asks, press Enter and approve with Touch ID"
  npm publish --access public
fi

step "checking the registry"
for _ in 1 2 3 4 5 6; do
  GITHEAD=$(curl -fsS https://registry.npmjs.org/edododraw | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s).versions[process.argv[1]];process.stdout.write(v?.gitHead??"")})' "$VERSION")
  [ -n "$GITHEAD" ] && break
  sleep 5
done
if [ -z "$GITHEAD" ]; then
  echo "  ! npm recorded no gitHead for $VERSION (published outside this checkout?) — the tag $TAG marks the commit"
else
  [ "$GITHEAD" = "$HEAD" ] || die "npm has edododraw@$VERSION from $GITHEAD, expected $HEAD"
  echo "  edododraw@$VERSION = $TAG = ${HEAD:0:7} on npm and GitHub"
fi

step "deploy the docs site"
bash scripts/deploy-pages.sh

echo
echo "✓ released edododraw@$VERSION ($TAG, ${HEAD:0:7})"
