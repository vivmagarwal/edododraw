#!/usr/bin/env bash
# Release the version in package.json from this machine — no CI involved:
#   verify → tag v<version> → push main + tag → npm publish → check the
#   registry → deploy the docs site.
# So npm, the git tag and the docs site always carry the same commit.
#
# Every step checks whether it is already done, so re-running after a failure
# (a wrong OTP, a network blip) simply resumes where it stopped.
#
#   npm version 0.17.0 --no-git-tag-version   # bump; add "## 0.17.0" to CHANGELOG.md + docs
#   git commit -am "0.17.0 — …"
#   npm run release                            # uses NPM_ACCESS_TOKEN from .env when present
#   npm run release -- --otp 123456            # or: your `npm login` session + a 2FA code
set -euo pipefail
cd "$(dirname "$0")/.."

OTP=""
while [ $# -gt 0 ]; do
  case "$1" in
    --otp) OTP="${2:-}"; shift 2 ;;
    --otp=*) OTP="${1#--otp=}"; shift ;;
    *) echo "✗ release: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

die() { echo "✗ release: $*" >&2; exit 1; }
step() { echo; echo "→ $*"; }

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
  step "npm publish"
  if [ -n "$OTP" ]; then
    # your `npm login` session + a one-time code from your authenticator
    npm publish --access public --otp "$OTP"
  elif [ -f .env ] && grep -q '^NPM_ACCESS_TOKEN=' .env; then
    RC=$(mktemp)
    trap 'rm -f "$RC"' EXIT
    TOKEN=$(grep '^NPM_ACCESS_TOKEN=' .env | head -1 | cut -d= -f2-)
    printf '//registry.npmjs.org/:_authToken=%s\n' "$TOKEN" > "$RC"
    NPM_CONFIG_USERCONFIG="$RC" npm publish --access public ||
      die "publish with NPM_ACCESS_TOKEN failed — if npm refused the token, run: npm login, then npm run release -- --otp <code>"
  else
    npm publish --access public # npm asks for the session / 2FA itself
  fi
fi

step "checking the registry"
for _ in 1 2 3 4 5 6; do
  GITHEAD=$(curl -fsS https://registry.npmjs.org/edododraw | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s).versions[process.argv[1]];process.stdout.write(v?.gitHead??"")})' "$VERSION")
  [ -n "$GITHEAD" ] && break
  sleep 5
done
[ "$GITHEAD" = "$HEAD" ] || die "npm has edododraw@$VERSION from ${GITHEAD:-<nothing>}, expected $HEAD"
echo "  edododraw@$VERSION = $TAG = ${HEAD:0:7} on npm and GitHub"

step "deploy the docs site"
bash scripts/deploy-pages.sh

echo
echo "✓ released edododraw@$VERSION ($TAG, ${HEAD:0:7})"
