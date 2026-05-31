"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { BN } from "@coral-xyz/anchor";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { Info, Vault as VaultIcon, Sparkles, AlertTriangle } from "lucide-react";

import { cn } from "@/lib/cn";
import { USDC_DECIMALS, fmtUsd } from "@/lib/formatters";
import { getExplorerUrl } from "@/lib/explorer";
import { formatError } from "@/lib/format-error";
import {
  useTradingVaults,
  type TradingVault,
} from "@/hooks/data/use-trading-vaults";
import { useDepositor } from "@/hooks/data/use-depositor";
import { useVaultDeposit } from "@/hooks/tx/use-vault-deposit";
import { useVaultWithdraw } from "@/hooks/tx/use-vault-withdraw";
import { VaultCard } from "@/components/vaults/VaultCard";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CopyAddress } from "@/components/ui/CopyAddress";
import { SkeletonCard } from "@/components/ui/Skeleton";

const WalletMultiButton = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false },
);

type Tab = "protocol" | "create";
type ModalTab = "deposit" | "withdraw";

// USDC amount string → u64 BN (6dp). null on invalid / non-positive.
function parseUsdc(s: string): BN | null {
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new BN(Math.round(n * 10 ** USDC_DECIMALS));
}

// Shares float string → u128 BN (6dp internal precision). null on invalid.
function parseShares(s: string): BN | null {
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new BN(Math.round(n * 10 ** USDC_DECIMALS));
}

export default function VaultsPage() {
  const [tab, setTab] = useState<Tab>("protocol");
  const [active, setActive] = useState<TradingVault | null>(null);

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8 md:px-6 md:py-10">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <VaultIcon size={22} className="text-sur-accent" aria-hidden />
            <h1 className="text-2xl font-semibold tracking-tight text-sur-text md:text-3xl">
              Trading Vaults
            </h1>
          </div>
          <p className="mt-1.5 max-w-xl text-sm text-sur-muted">
            Pooled, HLP-style vaults. Deposit USDC, a manager trades the pool
            on the perp engine, and depositors share PnL pro-rata.
          </p>
        </div>
        <WalletMultiButton />
      </header>

      {/* Tabs */}
      <div className="mt-6 flex w-fit items-center gap-1 rounded-lg border border-sur-border bg-sur-surface p-1">
        <TabButton active={tab === "protocol"} onClick={() => setTab("protocol")}>
          Protocol Vaults
        </TabButton>
        <TabButton active={tab === "create"} onClick={() => setTab("create")}>
          Create Vault
        </TabButton>
      </div>

      {tab === "protocol" ? (
        <ProtocolVaults onSelect={setActive} />
      ) : (
        <CreateVault />
      )}

      {active && (
        <DepositWithdrawModal
          vault={active}
          onClose={() => setActive(null)}
        />
      )}
    </main>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-sur-border text-sur-text"
          : "text-sur-muted hover:text-sur-text",
      )}
    >
      {children}
    </button>
  );
}

// ============================================================
// Protocol Vaults tab
// ============================================================

function ProtocolVaults({
  onSelect,
}: {
  onSelect: (v: TradingVault) => void;
}) {
  const { vaults, loading, error } = useTradingVaults();

  const totalTvl = useMemo(
    () => vaults.reduce((sum, v) => sum + v.estEquityUi, 0),
    [vaults],
  );

  return (
    <section className="mt-6">
      {/* Approximate-NAV disclaimer */}
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-sur-border bg-sur-surface px-3.5 py-2.5 text-[11px] text-sur-muted">
        <Info size={13} className="mt-0.5 shrink-0 text-sur-accent" aria-hidden />
        <p>
          TVL and share prices are{" "}
          <span className="text-sur-text">client-side estimates</span> derived
          from each vault&apos;s pooled balance. They do not include open-position
          unrealized PnL — the on-chain deposit / withdraw paths settle against
          true equity. Devnet.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 rounded-lg border border-sur-red/30 bg-sur-red/5 px-4 py-3 text-sm text-sur-red">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
          <span>Failed to load vaults: {error.message}</span>
        </div>
      ) : vaults.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="mb-3 text-[11px] text-sur-muted">
            {vaults.length} vault{vaults.length === 1 ? "" : "s"} ·{" "}
            <span className="text-sur-text">{fmtUsd(totalTvl)}</span> est. TVL
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vaults.map((v) => (
              <VaultCard
                key={v.pubkey.toBase58()}
                vault={v}
                onDeposit={onSelect}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-sur-border bg-sur-surface px-6 py-16 text-center">
      <VaultIcon size={28} className="text-sur-muted" aria-hidden />
      <div>
        <p className="text-sm font-medium text-sur-text">No vaults yet</p>
        <p className="mt-1 max-w-sm text-xs text-sur-muted">
          No trading vaults have been created on devnet yet. Vault creation is
          launching soon — be the first to run a pooled strategy.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Create Vault tab (honest "launching soon")
// ============================================================

function CreateVault() {
  return (
    <section className="mt-6">
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-sur-border bg-sur-surface px-6 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sur-accent/10">
          <Sparkles size={22} className="text-sur-accent" aria-hidden />
        </div>
        <div className="max-w-md">
          <h2 className="text-base font-semibold text-sur-text">
            Launching soon
          </h2>
          <p className="mt-1.5 text-sm text-sur-muted">
            The on-chain{" "}
            <span className="font-mono text-[13px] text-sur-text">
              create_vault
            </span>{" "}
            instruction is live, but the guided creation flow (name, fees,
            deposit cap, lockup, max drawdown) is still being wired into the UI.
            Managers will be able to launch a vault from this tab shortly.
          </p>
        </div>
        <div className="rounded-lg border border-sur-border bg-sur-bg px-3 py-2 text-[11px] text-sur-muted">
          Want early access as a vault manager? Reach out — devnet onboarding is
          manual for now.
        </div>
      </div>
    </section>
  );
}

// ============================================================
// Deposit / Withdraw modal
// ============================================================

function DepositWithdrawModal({
  vault,
  onClose,
}: {
  vault: TradingVault;
  onClose: () => void;
}) {
  const { publicKey, connected } = useWallet();
  const owner = useMemo(
    () => (connected ? publicKey ?? undefined : undefined),
    [connected, publicKey],
  );

  const { depositor, refetch } = useDepositor(
    vault.id,
    owner,
    vault.estSharePrice,
  );
  const deposit = useVaultDeposit();
  const withdraw = useVaultWithdraw();
  const { refetch: refetchVaults } = useTradingVaults();

  const [modalTab, setModalTab] = useState<ModalTab>("deposit");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const depositAmount = parseUsdc(amount);
  const shareAmount = parseShares(amount);
  const isDeposit = modalTab === "deposit";
  const isValid = isDeposit ? depositAmount !== null : shareAmount !== null;

  const heldSharesUi = depositor?.sharesUi ?? 0;
  const overWithdraw =
    !isDeposit && shareAmount !== null && (depositor?.sharesUi ?? 0) <= 0;

  function setMaxShares() {
    if (heldSharesUi > 0) setAmount(String(heldSharesUi));
  }

  async function handleSubmit() {
    if (busy || !isValid) return;
    if (!connected) {
      toast.error("Wallet not connected", {
        description: "Connect a Solana wallet to deposit or withdraw.",
      });
      return;
    }
    setBusy(true);
    try {
      let sig: string;
      if (isDeposit) {
        sig = await deposit({
          vaultId: vault.id,
          manager: vault.manager,
          amount: depositAmount!,
        });
      } else {
        sig = await withdraw({
          vaultId: vault.id,
          manager: vault.manager,
          shares: shareAmount!,
        });
      }
      toast.success(`${isDeposit ? "Deposit" : "Withdraw"} confirmed`, {
        description: `${sig.slice(0, 8)}…${sig.slice(-8)}`,
        action: {
          label: "explorer",
          onClick: () => window.open(getExplorerUrl(sig, "devnet"), "_blank"),
        },
        duration: 8000,
      });
      setAmount("");
      refetch();
      refetchVaults();
    } catch (err) {
      const { message, description } = formatError(err);
      toast.error(message, { description, duration: 10_000 });
    } finally {
      setBusy(false);
    }
  }

  const buttonLabel = () => {
    if (busy) return isDeposit ? "Depositing…" : "Withdrawing…";
    if (!isValid) return "Enter Amount";
    return isDeposit ? "Deposit USDC" : "Withdraw Shares";
  };

  const title =
    vault.name && vault.name.length > 0 ? vault.name : "Trading Vault";

  return (
    <Modal open onClose={onClose} title={title} width="w-[420px]">
      {/* Vault identity */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sur-border bg-sur-bg px-3 py-2.5">
        <CopyAddress address={vault.pubkey} label="Vault" chars={4} />
        <span className="text-[11px] text-sur-muted">
          TVL{" "}
          <span className="font-mono text-sur-text tabular-nums">
            {fmtUsd(vault.estEquityUi)}
          </span>{" "}
          <span className="text-sur-muted">(est.)</span>
        </span>
      </div>

      {/* Honest operator / settlement disclaimer */}
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-sur-yellow/25 bg-sur-yellow/5 px-3 py-2 text-[11px] text-sur-muted">
        <Info size={12} className="mt-0.5 shrink-0 text-sur-yellow" aria-hidden />
        <p>
          Deposits and withdrawals settle into your{" "}
          <span className="text-sur-text">perp_vault balance</span>, not your
          token wallet directly. Share price shown is an estimate. Devnet demo.
        </p>
      </div>

      {/* Modal tabs */}
      <div className="mb-3 flex overflow-hidden rounded-lg bg-sur-bg">
        {(["deposit", "withdraw"] as ModalTab[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              setModalTab(t);
              setAmount("");
            }}
            className={cn(
              "flex-1 py-1.5 text-[11px] font-semibold capitalize transition-colors",
              modalTab === t
                ? "bg-sur-border text-sur-text"
                : "text-sur-muted hover:text-sur-text",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Your position */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-sur-border bg-sur-bg px-2.5 py-2">
          <div className="text-[9px] uppercase tracking-wider text-sur-muted">
            Your Shares
          </div>
          <div className="mt-0.5 font-mono text-xs tabular-nums text-sur-text">
            {heldSharesUi.toFixed(4)}
          </div>
        </div>
        <div className="rounded-lg border border-sur-border bg-sur-bg px-2.5 py-2">
          <div className="text-[9px] uppercase tracking-wider text-sur-muted">
            Est. Value
          </div>
          <div className="mt-0.5 font-mono text-xs tabular-nums text-sur-text">
            {fmtUsd(depositor?.estValueUi ?? 0)}
          </div>
        </div>
      </div>

      {/* Amount input */}
      <div className="mb-1.5">
        <div className="mb-1 flex items-center justify-between">
          <label className="text-[10px] text-sur-muted">
            {isDeposit ? "Deposit Amount (USDC)" : "Shares to Withdraw"}
          </label>
          {!isDeposit && heldSharesUi > 0 && (
            <button
              onClick={setMaxShares}
              className="text-[10px] font-medium text-sur-accent hover:underline"
            >
              Max {heldSharesUi.toFixed(4)}
            </button>
          )}
        </div>
        <div className="relative">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            min="0"
            step="0.0001"
            disabled={busy}
            className="w-full rounded border border-sur-border bg-sur-bg px-3 py-2 text-right font-mono text-sm tabular-nums transition-colors placeholder:text-sur-muted/50 focus:border-sur-accent disabled:opacity-50"
          />
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-sur-muted">
            {isDeposit ? "$" : "◧"}
          </span>
        </div>
      </div>

      {overWithdraw && (
        <p className="mb-1.5 text-[10px] text-sur-red">
          You hold no shares in this vault.
        </p>
      )}

      {/* Submit */}
      {!connected ? (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-lg border border-sur-border bg-sur-bg px-3 py-4 text-center">
          <p className="text-xs text-sur-muted">
            Connect your wallet to deposit or withdraw.
          </p>
          <WalletMultiButton />
        </div>
      ) : (
        <Button
          variant={isDeposit ? "long" : "danger"}
          size="lg"
          className="mt-3 w-full"
          onClick={handleSubmit}
          loading={busy}
          disabled={!isValid || busy || vault.paused || overWithdraw}
        >
          {vault.paused ? "Vault Paused" : buttonLabel()}
        </Button>
      )}
    </Modal>
  );
}
