#!/usr/bin/env bash
# One-shot installer for the Todo Raycast extension.
#
# Downloads the latest pre-built release from GitHub, extracts it to a
# managed location, and imports it into Raycast as a permanent developer
# extension. No Node.js, no build step, no ongoing dev process.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/vishalkg/raycast-todo/main/install.sh | bash
#
# Or clone and run locally:
#   ./install.sh

set -euo pipefail

# ----- Configuration -----
REPO="vishalkg/raycast-todo"
INSTALL_DIR="$HOME/.raycast-todo"
TMP_DIR="$(mktemp -d -t raycast-todo.XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

# ----- Formatting -----
RESET="$(tput sgr0 2>/dev/null || printf '')"
BOLD="$(tput bold 2>/dev/null || printf '')"
GREEN="$(tput setaf 2 2>/dev/null || printf '')"
YELLOW="$(tput setaf 3 2>/dev/null || printf '')"
RED="$(tput setaf 1 2>/dev/null || printf '')"
GREY="$(tput setaf 0 2>/dev/null || printf '')"
MAGENTA="$(tput setaf 5 2>/dev/null || printf '')"

info()      { printf '%s\n' "${BOLD}${GREY}>${RESET} $*"; }
warn()      { printf '%s\n' "${YELLOW}! $*${RESET}"; }
error()     { printf '%s\n' "${RED}x $*${RESET}" >&2; }
completed() { printf '%s\n' "${GREEN}✓${RESET} $*"; }
abort()     { error "$@"; exit 1; }

# ----- Platform check -----
if [[ "$OSTYPE" != "darwin"* ]]; then
  abort "Only macOS is supported. Detected: $OSTYPE"
fi

command -v curl >/dev/null 2>&1  || abort "curl is required."
command -v tar  >/dev/null 2>&1  || abort "tar is required."

# ----- Raycast check -----
raycast_app_path() {
  [[ -d "$HOME/Applications/Raycast.app" ]] && echo "$HOME/Applications/Raycast.app" && return
  [[ -d "/Applications/Raycast.app"      ]] && echo "/Applications/Raycast.app"
}

RAYCAST_APP="$(raycast_app_path || true)"
if [[ -z "$RAYCAST_APP" ]]; then
  abort "Raycast.app not found. Install Raycast from https://raycast.com/ and rerun."
fi

raycast_version() {
  defaults read "$1/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null
}

version_lt() {
  local a="$1" b="$2"
  local IFS=.
  read -r -a av <<<"$a"
  read -r -a bv <<<"$b"
  for i in 0 1 2; do
    local ai="${av[$i]:-0}"
    local bi="${bv[$i]:-0}"
    if (( ai < bi )); then return 0; fi
    if (( ai > bi )); then return 1; fi
  done
  return 1
}

RAYCAST_VER="$(raycast_version "$RAYCAST_APP" || echo "0.0.0")"
if version_lt "$RAYCAST_VER" "1.94.4"; then
  warn "Raycast $RAYCAST_VER is older than 1.94.4."
  warn 'Please update Raycast and rerun this installer.'
  open "raycast://extensions/raycast/raycast/check-for-updates" 2>/dev/null || true
  exit 1
fi

info "Raycast $RAYCAST_VER detected."

# ----- Fetch latest release -----
info "Fetching latest release metadata..."
API_URL="https://api.github.com/repos/$REPO/releases/latest"
RELEASE_JSON="$TMP_DIR/release.json"

if ! curl -fsSL "$API_URL" -o "$RELEASE_JSON"; then
  abort "Failed to fetch release info from $API_URL. Is the repo public and does it have a release?"
fi

# Extract tarball URL (first asset ending in .tar.gz)
TARBALL_URL="$(python3 -c '
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
for asset in data.get("assets", []):
    if asset["name"].endswith(".tar.gz"):
        print(asset["browser_download_url"])
        sys.exit(0)
sys.exit(1)
' "$RELEASE_JSON")" || abort "No .tar.gz asset found in the latest release."

TAG_NAME="$(python3 -c '
import json, sys
with open(sys.argv[1]) as f:
    print(json.load(f)["tag_name"])
' "$RELEASE_JSON")"

info "Downloading $TAG_NAME from $TARBALL_URL ..."
TARBALL="$TMP_DIR/release.tar.gz"
curl -fsSL "$TARBALL_URL" -o "$TARBALL" || abort "Failed to download release tarball."
completed "Downloaded."

# ----- Install into managed directory -----
info "Extracting to $INSTALL_DIR ..."
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
tar -xzf "$TARBALL" -C "$INSTALL_DIR" || abort "Failed to extract tarball."
completed "Extracted."

# ----- Enable Import Extension deep-link -----
info "Enabling Raycast's Import Extension deep-link..."
defaults write com.raycast.macos alwaysAllowCommandDeeplinking -dict-add \
  "builtin_command_developer_importExtension" -int 1 >/dev/null 2>&1 || true
completed "Deep-link enabled."

# ----- Final import -----
# Build URL-encoded context: {"path":"<INSTALL_DIR>","skipOnboarding":true}
CONTEXT_JSON="{\"path\":\"$INSTALL_DIR\",\"skipOnboarding\":true}"
ENCODED_CONTEXT="$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$CONTEXT_JSON")"

info "Importing extension into Raycast..."
open "raycast://extensions/raycast/developer/import-extension?context=${ENCODED_CONTEXT}" || \
  abort "Failed to open Raycast Import Extension."

completed "Todo extension installed (${TAG_NAME})."
echo ""
echo "${BOLD}Next steps:${RESET}"
echo "  1. If prompted, enable \"Import Extension\" in Raycast:"
echo "     Settings → Extensions → Developer → check the box."
echo "     Sign in with a free Raycast account if prompted."
echo "  2. Open Raycast and search for 'Todo'."
echo "  3. On first launch, set the path to your markdown file."
echo ""
echo "To update later: rerun this installer."
echo "To uninstall: Raycast Settings → Extensions → Todo → ... → Uninstall,"
echo "              then rm -rf $INSTALL_DIR"
