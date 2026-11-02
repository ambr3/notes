#!/usr/bin/env bash
# Seclusa Notes — run this app's own tests.
#
# The app is its own repository, so its tests run here rather than in the
# this folder. Node only: no dependencies to install, no network.
set -euo pipefail
cd "$(dirname "$0")"

echo "→ notes tests @ $PWD"

node test/logic.test.mjs

# The service worker has to keep its precache list in step with the files
# that are actually shipped, or the app installs and then goes blank offline.
missing=0
while read -r asset; do
  if [ ! -f "$asset" ]; then
    echo "FAIL: sw.js precaches $asset, which does not exist"
    missing=1
  fi
done < <(grep -oE '"\./[^"]+"' sw.js | tr -d '"' | sed 's|^\./||; s|?.*$||' | sort -u)

if [ "$missing" -eq 0 ]; then
  echo "PASS: every precached file exists"
else
  echo "FAIL: the precache list names files that are not there"
  exit 1
fi

# The version is written in several places. Each one must name the same
# release, or the cache, the stylesheet URLs and the About sheet disagree.
version=$(grep -oE 'CACHE_PREFIX \+ "v[0-9.]+' sw.js | grep -oE '[0-9.]+$')
stale=$(grep -ohE '(\?v=|Version )[0-9.]+' index.html sw.js manifest.webmanifest 2>/dev/null \
  | grep -oE '[0-9]+(\.[0-9]+)+' | sort -u | grep -vx "$version" || true)
if [ -z "$stale" ]; then
  echo "PASS: every version reference is $version"
else
  echo "FAIL: version $version expected, but these also appear: $stale"
  exit 1
fi

# Reference every script the page loads, so a rename cannot ship a 404.
missing_script=0
while read -r src; do
  [ -f "$src" ] || { echo "FAIL: index.html loads $src, which does not exist"; missing_script=1; }
done < <(grep -oE '<script src="[^"]+"' index.html | sed 's/<script src="//; s/"$//')
if [ "$missing_script" -eq 0 ]; then
  echo "PASS: every script in index.html exists"
else
  exit 1
fi

echo "→ notes tests passed"
