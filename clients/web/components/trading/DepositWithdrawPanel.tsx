"use client";

import { useState, useEffect, useMemo } from "react";
import { BN } from "@coral-xyz/anchor";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";

import { useDepositUSDC } from "@/hooks/tx/use-deposit-usdc";
import { useWithdrawUSDC } from "@/hooks/tx/use-withdraw-usdc";
import { useVaultBalance } from "@/hooks/data/use-vault-balance";
import { USDC_DECIMALS, formatBN } from "@/lib/formatters";
import { getExplorerUrl } from "@/lib/explorer";
import { formatError } from "@/lib/format-error";

type Tab = "deposit" | "withdraw";

function parseAmount(s: string): BN | null {
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  const scaled = Math.round(n * 10 ** USDC_DECIMALS);
  return new BN(scaled);
}

export function DepositWithdrawPanel() {
  const { publicKey, connected } = useWallet();
  const trader = useMemo(
    () => (connected ? publicKey ?? undefined : undefined),
    [connected, publicKey],
  );

  const { balance, refetch } = useVaultBalance(trader);
  const deposit = useDepositUSDC();
  const withdraw = useWithdrawUSDC();

  const [tab, setTab] = useState<Tab>("deposit");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setAmount(""), [tab]);

  const amountBn = parseAmount(amount);
  const isValid = amountBn !== null;

  const vaultBalanceUi = balance ? formatBN(balance, USDC_DECIMALS, 2) : "0.00";

  async function handleSubmit() {
    if (!amountBn || busy) return;
    if (!connected) {
      toast.error("Wallet not connected", {
        description: "Connect a Solana wallet to deposit or withdraw.",
      });
      return;
    }
    setBusy(true);
    try {
      const sig =
        tab === "deposit" ? await deposit(amountBn) : await withdraw(amountBn);
      toast.success(`${tab === "deposit" ? "Deposit" : "Withdraw"} confirmed`, {
        description: `${sig.slice(0, 8)}…${sig.slice(-8)}`,
        action: {
          label: "explorer",
          onClick: () => window.open(getExplorerUrl(sig, "devnet"), "_blank"),
        },
        duration: 8000,
      });
      setAmount("");
      refetch();
    } catch (err) {
      const { message, description } = formatError(err);
      toast.error(message, { description, duration: 10_000 });
    } finally {
      setBusy(false);
    }
  }

  if (!connected) {
    return (
      <div className="p-3">
        <div className="panel-header text-[10px]">Funds</div>
        <div className="flex flex-col items-center gap-3 py-6 px-4">
          <p className="text-xs text-sur-muted text-center">
            Connect your wallet to deposit USDC and start trading.
          </p>
        </div>
      </div>
    );
  }

  const buttonLabel = () => {
    if (busy) return tab === "deposit" ? "Depositing…" : "Withdrawing…";
    if (!isValid) return "Enter Amount";
    return tab === "deposit" ? `Deposit ${amount} USDC` : `Withdraw ${amount} USDC`;
  };

  return (
    <div className="p-3">
      <div className="flex mb-3 bg-sur-bg rounded overflow-hidden">
        {(["deposit", "withdraw"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 text-[11px] font-semibold transition-colors capitalize ${
              tab === t ? "bg-sur-border text-sur-text" : "text-sur-muted hover:text-sur-text"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 mb-3">
        <div className="bg-sur-bg rounded px-2.5 py-2 border border-sur-border">
          <div className="text-[9px] text-sur-muted uppercase tracking-wider">
            Vault Balance (USDC)
          </div>
          <div className="text-xs font-mono font-medium mt-0.5 tabular-nums">
            ${vaultBalanceUi}
          </div>
        </div>
      </div>

      <div className="mb-2">
        <label className="text-[10px] text-sur-muted mb-1 block">
          {tab === "deposit" ? "Deposit Amount" : "Withdraw Amount"} (USDC)
        </label>
        <div className="relative">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            min="0"
            step="0.01"
            disabled={busy}
            className="w-full bg-sur-bg border border-sur-border rounded px-3 py-2 text-sm font-mono text-right focus:border-sur-accent transition-colors placeholder:text-sur-muted/50 disabled:opacity-50"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-sur-muted">$</span>
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={busy || !isValid}
        className={`w-full py-2.5 rounded text-xs font-semibold transition-colors ${
          tab === "deposit"
            ? "bg-sur-green/20 text-sur-green hover:bg-sur-green/30 disabled:opacity-30 disabled:cursor-not-allowed"
            : "bg-sur-red/20 text-sur-red hover:bg-sur-red/30 disabled:opacity-30 disabled:cursor-not-allowed"
        }`}
      >
        {busy && (
          <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-2 align-middle" />
        )}
        {buttonLabel()}
      </button>
    </div>
  );
}
