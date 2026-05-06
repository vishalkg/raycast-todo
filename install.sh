#!/usr/bin/env bash
# One-shot installer for the Todo Raycast extension.
#
# Installs the extension via Raycast's "Import Extension" feature, so it
# becomes a permanent developer extension — no ongoing dev-mode process
# required. Survives reboots.
#
# Usage: ./install.sh

set -euo pipefail

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
confirm()   { read -r -p "${MAGENTA}?${RESET} $* ${BOLD}[y/N]${RESET} " yn; [[ $yn =~ ^[Yy]$ ]]; }

# ----- Prerequisites -----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "$OSTYPE" != "darwin"* ]]; then
  abort "Only macOS is supported right now. Detected: $OSTYPE"
fi

command -v node >/dev/null 2>&1 || abort "Node.js is required. Install from https://nodejs.org/"
command -v npm  >/dev/null 2>&1 || abort "npm is required (ships with Node.js)."

# Raycast app check
raycast_app_path() {
  [[ -d "$HOME/Applications/Raycast.app" ]] && echo "$HOME/Applications/Raycast.app" && return
  [[ -d "/Applications/Raycast.app"      ]] && echo "/Applications/Raycast.app"
}

RAYCAST_APP="$(raycast_app_path || true)"
if [[ -z "$RAYCAST_APP" ]]; then
  abort "Raycast.app not found. Install Raycast from https://raycast.com/ and rerun."
fi

# Raycast version check (Import Extension requires ≥ 1.94.4)
raycast_version() {
  defaults read "$1/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null
}

version_lt() {
  # version_lt A B → returns 0 if A < B
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
  warn "Raycast version $RAYCAST_VER is older than 1.94.4."
  warn 'Open Raycast → Check For Updates and update, then rerun this script.'
  open "raycast://extensions/raycast/raycast/check-for-updates" 2>/dev/null || true
  exit 1
fi

info "Raycast $RAYCAST_VER detected."

# ----- Build -----
cd "$SCRIPT_DIR"

info "Installing npm dependencies..."
npm install --no-audit --no-fund >/dev/null 2>&1 || abort "npm install failed. Run 'npm install' manually to see errors."
completed "Dependencies installed."

info "Building the extension..."
npx ray build -e dist -o dist >/tmp/raycast-todo-build.log 2>&1 || {
  cat /tmp/raycast-todo-build.log
  abort "Build failed. See log above."
}
completed "Extension built."

# ray build -e dist outputs to ./dist
BUILD_DIR="$SCRIPT_DIR/dist"
if [[ ! -d "$BUILD_DIR" ]]; then
  abort "Expected build output at $BUILD_DIR but it doesn't exist."
fi

# ----- Enable Import Extension deep-link -----
info "Enabling Raycast's Import Extension deep-link..."
defaults write com.raycast.macos alwaysAllowCommandDeeplinking -dict-add \
  "builtin_command_developer_importExtension" -int 1 >/dev/null 2>&1 || true
completed "Deep-link enabled."

# ----- Ensure Import Extension is turned on in Raycast -----
warn 'If "Import Extension" is not enabled in Raycast yet, enable it:'
warn '   1. Raycast Settings → Extensions → Developer'
warn '   2. Check the box next to "Import Extension"'
warn '   3. Sign in with a Raycast account when prompted (free, no Pro needed).'
warn ''
if confirm "Open Raycast Extensions settings now to verify?"; then
  open 'raycast://extensions/raycast/raycast-settings/extensions' || true
  confirm "Ready to continue?"
fi

# ----- Import Extension -----
# Build URL-encoded context: {"path":"<BUILD_DIR>","skipOnboarding":true}
CONTEXT_JSON="{\"path\":\"$BUILD_DIR\",\"skipOnboarding\":true}"
# URL-encode with Python (always present on macOS)
ENCODED_CONTEXT="$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$CONTEXT_JSON")"

info "Importing extension into Raycast..."
open "raycast://extensions/raycast/developer/import-extension?context=${ENCODED_CONTEXT}" || \
  abort "Failed to trigger Raycast Import Extension."

completed "Todo extension installed."
echo ""
echo "Open Raycast and search for 'Todo'. On first launch you'll be asked to"
echo "set the path to your markdown file (e.g. ~/Documents/todo.md)."
echo ""
echo "To update later: git pull && ./install.sh"
