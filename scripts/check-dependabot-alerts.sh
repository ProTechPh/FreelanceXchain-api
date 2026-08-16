#!/usr/bin/env bash
# check-dependabot-alerts.sh — report open Dependabot alerts for a GitHub repo via `gh`.
#
# Usage:
#   scripts/check-dependabot-alerts.sh [owner/repo]
#
# With no arguments, the repository is inferred from the current git remote
# (via `gh repo view`). Requires `gh` to be installed and authenticated
# (`gh auth login`).
#
# Exit codes:
#   0 — no open alerts
#   1 — open alerts were found (a summary is printed)
#   2 — could not determine the repo or the API call failed
#
# NOTE: reports up to 100 alerts (GitHub's per-page cap). If you ever have
# more than that open, page through the API with `gh api --paginate`.

set -euo pipefail

REPO="${1:-}"
if [[ -z "${REPO}" ]]; then
  REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || true)"
fi
if [[ -z "${REPO}" ]]; then
  echo "error: could not determine the repository — pass it as the first argument or run inside a git checkout" >&2
  exit 2
fi

API="repos/${REPO}/dependabot/alerts?state=open&per_page=100"

if ! gh api "${API}" >/dev/null 2>&1; then
  echo "error: could not query Dependabot alerts for ${REPO} — is 'gh' authenticated and is Dependabot enabled on the repo?" >&2
  exit 2
fi

COUNT="$(gh api "${API}" --jq 'length')"

if [[ "${COUNT}" -eq 0 ]]; then
  echo "No open Dependabot alerts for ${REPO}."
  exit 0
fi

echo "${COUNT} open Dependabot alert(s) for ${REPO}:"
gh api "${API}" --jq '.[] | "  [#\(.number)] \(.security_advisory.severity | ascii_upcase) \(.dependency.package.name) (\(.dependency.relationship)) | fixed in \(.security_vulnerability.first_patched_version.identifier // "unpublished") | \(.html_url)"'

exit 1
