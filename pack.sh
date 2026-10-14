#!/bin/sh
# Builds the zip to upload to the Chrome Web Store: dist/meet-standup-turn-<version>.zip
set -e
cd "$(dirname "$0")"
node --test test/*.test.js >/dev/null
V=$(node -p "require('./manifest.json').version")
mkdir -p dist
rm -f "dist/meet-standup-turn-$V.zip"
zip -qr "dist/meet-standup-turn-$V.zip" manifest.json rotation.js content.js background.js icons/icon16.png icons/icon32.png icons/icon48.png icons/icon128.png
echo "dist/meet-standup-turn-$V.zip"
