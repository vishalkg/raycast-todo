#!/usr/bin/env bash
# Install the Todo extension from the local source tree (requires Node.js).
#
# Use this if you want to run an unreleased version of the extension —
# e.g. a branch, a local modification, or just the current mainline.
#
# For a normal install, prefer: ./install.sh
# (which downloads a pre-built release and needs no Node.js).

set -euo pipefail

RESET="$(tput sgr0 2>/dev/null || printf '')"
BOLD="$(tput bold 2>/dev/null || printf '')"
GREEN="$(tput setaf 2 2>/dev/null || printf '')"
YELLOW="$(tput setaf 3 2>/dev/null || printf '')"
RED="$(tput setaf 1 2>/dev/null || printf '')"
GREY="$(tput setaf 0 2>/dev/null || printf '')"

info()      { printf '%s\n' "${BOLD}${GREY}>${RESET} $*"; }
warn()      { printf '%s\n' "${YELLOW}! $*${RESET}"; }
error()     { printf '%s\n' "${RED}x $*${RESET}" >&2; }
completed() { printf '%s\n' "${GREEN}✓${RESET} $*"; }
abort()     { error "$@"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "$OSTYPE" != "darwin"* ]]; then
  abort "Only macOS is supported. Detected: $OSTYPE"
fi

command -v node >/dev/null 2>&1 || abort "Node.js is required. Install from https://nodejs.org/"
command -v npm  >/dev/null 2>&1 || abort "npm is required (ships with Node.js)."

raycast_app_path() {
  [[ -d "$HOME/Applications/Raycast.app" ]] && echo "$HOME/Applications/Raycast.app" && return
  [[ -d "/Applications/Raycast.app"      ]] && echo "/Applications/Raycast.app"
}

RAYCAST_APP="$(raycast_app_path || true)"
[[ -z "$RAYCAST_APP" ]] && abort "Raycast.app not found."

cd "$SCRIPT_DIR"

info "Installing npm dependencies..."
npm install --no-audit --no-fund >/dev/null 2>&1 || abort "npm install failed."
completed "Dependencies installed."

info "Building the extension..."
npx ray build -e dist -o dist >/tmp/raycast-todo-build.log 2>&1 || {
  cat /tmp/raycast-todo-build.log
  abort "Build failed."
}
completed "Extension built to $SCRIPT_DIR/dist"

info "Enabling Raycast's Import Extension deep-link..."
defaults write com.raycast.macos alwaysAllowCommandDeeplinking -dict-add \
  "builtin_command_developer_importExtension" -int 1 >/dev/null 2>&1 || true

CONTEXT_JSON="{\"path\":\"$SCRIPT_DIR/dist\",\"skipOnboarding\":true}"
ENCODED_CONTEXT="$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$CONTEXT_JSON")"

info "Importing extension into Raycast..."
open "raycast://extensions/raycast/developer/import-extension?context=${ENCODED_CONTEXT}" || \
  abort "Failed to open Raycast Import Extension."

completed "Installed from local source."
echo ""
echo "Note: because this is a source build, updating the extension means"
echo "re-running this script after pulling new code. For managed updates,"
echo "use the release-based installer: ./install.sh"
