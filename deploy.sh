#!/bin/bash
# Deploy: secret scan -> clasp push -> update the EXISTING web app deployment
# (so José's URL never changes). Usage: ./deploy.sh "short description"
set -euo pipefail
export PATH="$HOME/.local/node/bin:$PATH"
cd "$(dirname "$0")"

python3 scripts/secret_scan.py || { echo "Aborting deploy."; exit 1; }

# The deployment ID is effectively the web app URL, so it lives outside the repo.
ID_FILE="$HOME/ibarra-secrets/deployment.id"
if [ ! -s "$ID_FILE" ]; then
  echo "Missing $ID_FILE. Create the first deployment once (see README) and save its ID there."
  exit 1
fi
DEPLOYMENT_ID="$(tr -d '[:space:]' < "$ID_FILE")"
DESC="${1:-update $(date '+%Y-%m-%d %H:%M')}"

clasp push --force
clasp update-deployment "$DEPLOYMENT_ID" --description "$DESC"
echo "Deployed to existing deployment $DEPLOYMENT_ID"
