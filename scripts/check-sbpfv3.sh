#!/usr/bin/env bash
# SBPFv3 feature-gate monitor (informational).
#
# HISTORY / CORRECTION: an earlier revision of this script claimed the fresh
# devnet re-deploy was BLOCKED until SBPFv3 (SIMD-0178/0179/0189) activates,
# on the premise that the Agave 3.1.x toolchain "only produces SBPFv3
# binaries". That premise was false: `cargo-build-sbf --arch` defaults to
# **v0** (verified: the built .so ELF headers carry e_flags 0x0 = SBPFv0),
# which devnet and mainnet accept today. The 11-program deploy ran fine on
# 2026-06-30 with the v0 binaries this toolchain emits by default.
#
# This check remains only to watch when v3 becomes available as an OPTIONAL
# performance upgrade (static syscalls, no runtime relocations). When the
# gate flips to "active", programs MAY be rebuilt with `--arch v3` and
# redeployed — nothing requires it.
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
  echo "✅ SBPFv3 is ACTIVE — optional: rebuild with 'cargo-build-sbf --arch v3' for the perf upgrade."
else
  echo ""
  echo "⏳ SBPFv3 still inactive here. No action needed — v0 builds deploy and run today."
fi
