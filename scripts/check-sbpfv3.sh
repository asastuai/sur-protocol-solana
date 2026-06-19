#!/usr/bin/env bash
# Deploy-readiness monitor.
# SUR's fresh re-deploy is blocked until devnet activates SBPFv3
# (SIMD-0178/0179/0189), because the current Agave 3.1.x toolchain only
# produces SBPFv3 binaries. This checks the feature gate; when it flips to
# "active", the prepared deploy (new program IDs + J1GMec admin) can run.
#
# Usage: bash scripts/check-sbpfv3.sh [cluster_url]
set -euo pipefail
URL="${1:-https://api.devnet.solana.com}"
FEATURE="BUwGLeF3Lxyfv1J1wY8biFHBB2hrk2QhbNftQf3VV3cC" # SIMD-0178/0179/0189

echo "cluster: $URL"
status=$(solana feature status "$FEATURE" --url "$URL" 2>&1 || true)
echo "$status"

if echo "$status" | grep -qiE "\bactive\b"; then
  echo ""
  echo "✅ SBPFv3 is ACTIVE — the fresh deploy can run now."
  echo "   Next: WSL anchor build (v1.52) -> deploy 11 programs -> devnet-init.ts -> rewire web."
else
  echo ""
  echo "⏳ SBPFv3 still inactive on this cluster. Deploy remains blocked. Re-check later."
fi
