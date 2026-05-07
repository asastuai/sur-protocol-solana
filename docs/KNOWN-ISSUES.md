# Known Issues

## v0.2: darkpool→engine+vault CPI wiring blocked by anchor 0.31.1 IDL build bug

### Symptom

When `a2a_darkpool/Cargo.toml` declares `perp_vault = { path = "...", features = ["cpi"] }`, `anchor build` fails during the IDL build phase with:

```
error[E0599]: no associated function or constant named `create_type` found for struct `TokenAccount` in the current scope
error[E0599]: no associated function or constant named `DISCRIMINATOR` found for struct `TokenAccount` in the current scope
error[E0599]: no associated function or constant named `insert_types` found for struct `TokenAccount` in the current scope
```

These are part of the `IdlBuild` trait that anchor-spl exposes when `idl-build` feature is active.

### Root cause (suspected)

`perp_vault` has feature flags:
- `cpi = ["no-entrypoint"]` (activated when darkpool depends with cpi feature)
- `idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]` (activated when anchor builds the IDL)

When BOTH are active simultaneously (which happens during `anchor build` of the workspace once darkpool consumes perp_vault as a CPI dep), anchor-spl's `idl-build` feature does not propagate properly through the resolver-2 boundary. The macro generates calls to functions that aren't compiled in.

Forcing `anchor-spl = { version = "0.31.1", features = ["idl-build"] }` always-on did NOT fix it — same error.

### What's preserved

The CPI wiring work is committed at `2bd2bf1` (v0.2-rc6 attempt) and reverted at `f23d17a`. The accept_and_settle.rs CPI implementation, the test setup with vault deposits + cross-program operator authorizations — all there in git history. Apply with `git show 2bd2bf1 -- programs/a2a_darkpool` to recover.

The perp_engine `payer` separation from `operator` was REVERTED too (it was bundled in the same commit).

### Approaches to try next session

1. **Build per-program separately + manually link IDLs**: skip the workspace-wide idl-build, generate each program's IDL standalone, then assemble.
2. **Manual CPI without using `cpi::accounts::*` types**: declare callee accounts as plain `AccountInfo` and serialize the instruction manually with `solana_program::instruction::Instruction` + `invoke_signed`. Bypasses the typed CPI macros that trigger the IDL bug.
3. **Pin to anchor 0.30.x**: 0.30 is reported stable for cross-program CPI + idl-build combinations. Cost: re-port all 5 programs (mostly mechanical s/0.31.1/0.30.1/g + revert AccountInfo::resize → AccountInfo::realloc).
4. **Wait for anchor 0.31.2+** (community fix likely incoming).
5. **Workaround at workspace level**: `[workspace.metadata.anchor]` with custom IDL build excluding the cpi-dep crates.

Recommended order to try: (2) manual invoke_signed → (1) per-program IDL → (3) downgrade anchor.

### Status of v0.2 milestone

- ✅ All 5 programs scaffolded + tested in isolation (34/34 tests passing)
- ✅ oracle→engine CPI wired and tested (this combo works because oracle_router doesn't use anchor-spl)
- 🚧 darkpool→engine+vault CPI: pending (this guide)
- 🚧 engine→vault CPI: pending (same constraint — engine uses anchor-spl indirectly via perp_vault dep)

The bug is bounded: only programs using `anchor-spl` types + `cpi` feature simultaneously hit it. perp_vault is the only such program currently. Once perp_vault is wired-around, the rest of the protocol can CPI freely.

### Test command to reproduce

```bash
# In WSL2 with toolchain installed:
cd ~/projects/sur-protocol-solana
git checkout 2bd2bf1
anchor build  # → fails with the IdlBuild errors above
git checkout main  # back to working state
```
