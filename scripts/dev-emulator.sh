#!/usr/bin/env bash
# Local development against the Firebase emulators (Firestore, Auth, Storage)
# instead of the real project: no daily quota, no cost, and test data can't
# touch real shops. Clerk sign-in is still the real Clerk dev instance.
#
#   npm run dev         start emulators + next dev (Ctrl+C saves data to .emulator-data/)
#   npm run dev:real    next dev against the REAL Firebase project (uses daily quota)
#   npm run seed:emu    (in a second terminal, while dev runs) load the test shop
#
# The emulators need Java 11+. Uses `java` from PATH, else a portable JRE in
# ~/.local/opt/jdk-*/ (download one from https://adoptium.net if neither exists).
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v java >/dev/null 2>&1; then
  jre=$(ls -d "$HOME"/.local/opt/jdk-*/ 2>/dev/null | sort -V | tail -1 || true)
  if [[ -z "$jre" ]]; then
    echo "Java 11+ is required for the Firebase emulators. Install it, or unpack a JRE into ~/.local/opt/." >&2
    exit 1
  fi
  export JAVA_HOME="${jre%/}"
  export PATH="$JAVA_HOME/bin:$PATH"
fi

# Same project id as the app's keys, so the emulator's data is the data the app reads.
# (|| true: a missing .env.local makes grep exit 2, which pipefail would turn into a silent exit.)
project=$( (grep -shE '^(FIREBASE_ADMIN_PROJECT_ID|NEXT_PUBLIC_FIREBASE_PROJECT_ID)=' .env.local .env || true) | head -1 | cut -d= -f2- | tr -d '"')
if [[ -z "$project" ]]; then
  echo "Set NEXT_PUBLIC_FIREBASE_PROJECT_ID in .env / .env.local first." >&2
  exit 1
fi

import=()
[[ -d .emulator-data ]] && import=(--import=.emulator-data)

# emulators:exec sets FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST /
# FIREBASE_STORAGE_EMULATOR_HOST for the child, which firebase-admin picks up
# on its own; NEXT_PUBLIC_FIREBASE_EMULATOR=1 does the same for the browser SDK.
exec npx firebase emulators:exec \
  --project "$project" \
  --only firestore,auth,storage \
  "${import[@]}" \
  --export-on-exit=.emulator-data \
  "NEXT_PUBLIC_FIREBASE_EMULATOR=1 npx next dev"
