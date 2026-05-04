#!/usr/bin/env bash
# Strip the com.apple.quarantine xattr from MDViewer.app and register it with
# LaunchServices so Finder double-click on .md files routes to MDViewer
# without Gatekeeper's "Apple cannot verify..." dialog.
#
# Required because GitHub Actions builds the .app with ad-hoc signing only;
# without a Developer ID + notarization, every download gets quarantined and
# Sequoia's Gatekeeper blocks document opens through it.
#
# Usage:
#   ./macos-install.sh                          # uses /Applications/MD Viewer.app
#   ./macos-install.sh /path/to/MD\ Viewer.app  # explicit path

set -euo pipefail

APP="${1:-/Applications/MD Viewer.app}"

if [[ ! -d "$APP" ]]; then
  echo "error: app not found at: $APP" >&2
  exit 1
fi

echo "Removing quarantine xattr from $APP"
xattr -dr com.apple.quarantine "$APP" || true

echo "Re-registering with LaunchServices"
LSREG=/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister
"$LSREG" -f "$APP"

echo "Done. Double-click any .md file in Finder to test."
echo "If the file is still blocked, the .md itself may be quarantined — run:"
echo "  xattr -d com.apple.quarantine /path/to/file.md"
