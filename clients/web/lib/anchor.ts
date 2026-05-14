import {
  AnchorProvider,
  Program,
  type Idl,
} from "@coral-xyz/anchor";
import {
  PublicKey,
  type Connection,
  type Transaction,
  type VersionedTransaction,
} from "@solana/web3.js";

// Browser-shape wallet interface that AnchorProvider actually consumes at
// runtime. The class exported as `Wallet` from @coral-xyz/anchor is the
// NodeWallet (requires a Keypair payer) which doesn't apply in the browser.
export interface BrowserWallet {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
}

// Readonly stub wallet used when no wallet is connected. AnchorProvider
// requires SOMETHING with a publicKey, but read paths never invoke
// signTransaction / signAllTransactions. We throw if anyone tries.
export function readonlyWallet(): BrowserWallet {
  const throwOnSign = (): never => {
    throw new Error(
      "readonlyWallet cannot sign — connect a wallet for write operations.",
    );
  };

  return {
    publicKey: PublicKey.default,
    signTransaction: <T extends Transaction | VersionedTransaction>(
      _tx: T,
    ): Promise<T> => throwOnSign(),
    signAllTransactions: <T extends Transaction | VersionedTransaction>(
      _txs: T[],
    ): Promise<T[]> => throwOnSign(),
  };
}

export function getAnchorProvider(
  connection: Connection,
  wallet: BrowserWallet | undefined,
): AnchorProvider {
  // AnchorProvider's `Wallet` parameter is the browser interface defined
  // in provider.d.ts, distinct from the NodeWallet class. Cast to satisfy
  // both at the type layer; AnchorProvider only ever calls publicKey +
  // signTransaction + signAllTransactions on it.
  return new AnchorProvider(
    connection,
    (wallet ?? readonlyWallet()) as unknown as ConstructorParameters<
      typeof AnchorProvider
    >[1],
    { commitment: "confirmed" },
  );
}

// Anchor 0.30+ embeds the address in the IDL; passing the IDL alone is enough.
// We keep the programId param for explicit wiring + future override.
export function getProgram<P extends Idl>(
  idl: P,
  _programId: PublicKey,
  provider: AnchorProvider,
): Program<P> {
  return new Program<P>(idl, provider);
}
