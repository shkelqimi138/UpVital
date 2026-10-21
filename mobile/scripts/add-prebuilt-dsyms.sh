#!/bin/bash
# Adds the crash-symbol files (dSYMs) for React Native's prebuilt frameworks (React,
# ReactNativeDependencies, hermesvm) to an Xcode archive. React Native publishes them on Maven but
# doesn't put them in the archive, so App Store Connect warns "The archive did not include a dSYM…"
# and crashes inside those frameworks can't be read. Each dSYM is copied only when its UUID matches
# the binary inside the archive; any mismatch stops the script before anything is uploaded.
#
# Usage (after Product → Archive, before Distribute App):
#   mobile/scripts/add-prebuilt-dsyms.sh [path/to/archive.xcarchive]
# Without a path it uses the newest UpVital (com.upvital.app) archive. Downloads are cached in
# ~/Library/Caches/upvital-dsyms (about 570 MB the first time per React Native / Hermes version).
set -euo pipefail

MOBILE="$(cd "$(dirname "$0")/.." && pwd)"
MAVEN="https://repo1.maven.org/maven2/com/facebook"
CACHE="$HOME/Library/Caches/upvital-dsyms"

ARCHIVE="${1:-}"
if [ -z "$ARCHIVE" ]; then
  while IFS= read -r candidate; do
    id=$(/usr/libexec/PlistBuddy -c "Print :ApplicationProperties:CFBundleIdentifier" "$candidate/Info.plist" 2>/dev/null || true)
    if [ "$id" = "com.upvital.app" ]; then ARCHIVE="$candidate"; break; fi
  done < <(ls -td "$HOME"/Library/Developer/Xcode/Archives/*/*.xcarchive 2>/dev/null)
fi
[ -d "$ARCHIVE" ] || { echo "No UpVital archive found. Pass the .xcarchive path." >&2; exit 1; }
APP=$(ls -d "$ARCHIVE"/Products/Applications/*.app | head -1)
echo "Archive: $ARCHIVE"

# Versions as installed by CocoaPods.
pod_version() { sed -nE "s/^  - $1 \(([^)]+)\):?$/\1/p" "$MOBILE/ios/Podfile.lock" | head -1; }
RN=$(pod_version "React-Core-prebuilt")
HERMES=$(pod_version "hermes-engine")
[ -n "$RN" ] && [ -n "$HERMES" ] || { echo "Couldn't read the React Native / Hermes versions from Podfile.lock." >&2; exit 1; }

uuid() { dwarfdump --uuid "$1" | awk '{print $2}' | sort | paste -sd ' ' -; }

# add <framework> <tarball URL> <slice folder inside the tarball>
add() {
  local name="$1" url="$2" slice="$3"
  local tarball="$CACHE/$(basename "$url")"
  local out="$CACHE/$(basename "$url" .tar.gz)"
  if [ ! -d "$out/$slice/$name.framework.dSYM" ]; then
    mkdir -p "$CACHE" "$out"
    [ -f "$tarball" ] || { echo "Downloading $(basename "$url")…"; curl -sfL -o "$tarball.part" "$url" && mv "$tarball.part" "$tarball"; }
    tar -xzf "$tarball" -C "$out" "./$slice/$name.framework.dSYM"
  fi
  local dsym="$out/$slice/$name.framework.dSYM"
  local shipped="$APP/Frameworks/$name.framework/$name"
  if [ "$(uuid "$shipped")" != "$(uuid "$dsym/Contents/Resources/DWARF/$name")" ]; then
    echo "✗ $name: the archive's binary doesn't match React Native's release build." >&2
    if [ "$name" = "hermesvm" ]; then
      echo "  The archive contains the Debug Hermes. Delete mobile/ios/Pods/.last_build_configuration and archive again." >&2
    fi
    exit 1
  fi
  rm -rf "$ARCHIVE/dSYMs/$name.framework.dSYM"
  cp -R "$dsym" "$ARCHIVE/dSYMs/"
  echo "✓ $name ($(uuid "$shipped"))"
}

add React "$MAVEN/react/react-native-artifacts/$RN/react-native-artifacts-$RN-reactnative-core-dSYM-release.tar.gz" ios-arm64
add ReactNativeDependencies "$MAVEN/react/react-native-artifacts/$RN/react-native-artifacts-$RN-reactnative-dependencies-dSYM-release.tar.gz" ios-arm64
add hermesvm "$MAVEN/hermes/hermes-ios/$HERMES/hermes-ios-$HERMES-hermes-framework-dSYM-release.tar.gz" iphoneos
echo "Done. Distribute App now uploads these symbols too."
