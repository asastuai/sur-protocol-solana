// Canonical MCP tool surface for SUR Protocol.
//
// Single source of truth for the /agents page tool grid. Each entry mirrors
// the shape an LLM-driven agent would discover via an MCP server in front of
// the on-chain programs. Input / output schemas are typed records (not zod)
// — the page renders them as JSON-ish blocks. Real wire validation happens
// at the SDK boundary (clients/sdk/*), not here.

export type ToolCategory = "read" | "write" | "intent";

export interface FieldSchema {
  /** Field name as it appears in the JSON payload. */
  name: string;
  /** Human-readable type label (e.g. "pubkey", "u64 (1e8 size units)"). */
  type: string;
  /** One-line clarifying note. Optional. */
  note?: string;
}

export interface McpTool {
  /** Canonical MCP method id (namespaced under `sur.`). */
  name: string;
  /** One-line description rendered in the card. */
  description: string;
  /** Input schema as a typed field list. Empty array = no args. */
  input: ReadonlyArray<FieldSchema>;
  /** Output schema as a typed field list. */
  output: ReadonlyArray<FieldSchema>;
  /** Read = safe to invoke from the playground. Write / intent = signer required. */
  category: ToolCategory;
  /** Underlying program this tool routes to. Purely informational. */
  program: "perp_vault" | "perp_engine" | "a2a_darkpool";
}

export const MCP_TOOLS: ReadonlyArray<McpTool> = [
  {
    name: "sur.list_markets",
    description: "List every active perp market with mark / index price.",
    input: [],
    output: [
      { name: "symbol", type: "string", note: "e.g. BTC-USD" },
      { name: "marketId", type: "bytes32" },
      { name: "markPrice", type: "u64 (1e6 USDC-style)" },
      { name: "indexPrice", type: "u64 (1e6 USDC-style)" },
      { name: "openInterestLong", type: "u64 (1e8 size units)" },
      { name: "openInterestShort", type: "u64 (1e8 size units)" },
    ],
    category: "read",
    program: "perp_engine",
  },
  {
    name: "sur.get_balance",
    description: "Read the agent's available margin balance in the perp vault.",
    input: [{ name: "trader", type: "pubkey" }],
    output: [
      { name: "balance", type: "u64 (6 decimals USDC)" },
      { name: "collateralBalance", type: "u64 (6 decimals USDC)" },
    ],
    category: "read",
    program: "perp_vault",
  },
  {
    name: "sur.get_position",
    description: "Read an agent's open position on a given market.",
    input: [
      { name: "trader", type: "pubkey" },
      { name: "marketId", type: "bytes32" },
    ],
    output: [
      { name: "size", type: "i64 (1e8, signed)", note: "negative = short" },
      { name: "entryPrice", type: "u64 (1e6)" },
      { name: "margin", type: "u64 (6 decimals USDC)" },
      { name: "lastUpdated", type: "i64 (unix timestamp)" },
    ],
    category: "read",
    program: "perp_engine",
  },
  {
    name: "sur.get_reputation",
    description: "Read an agent's persistent dark-pool reputation score.",
    input: [{ name: "agent", type: "pubkey" }],
    output: [
      { name: "score", type: "u64 (0-1000, 1000 = 100%)" },
      { name: "completedTrades", type: "u64" },
      { name: "totalVolume", type: "u64 (1e6)" },
      { name: "expiredIntents", type: "u64" },
      { name: "cancelledResponses", type: "u64" },
    ],
    category: "read",
    program: "a2a_darkpool",
  },
  {
    name: "sur.list_open_intents",
    description: "Fetch every open dark-pool intent not yet expired.",
    input: [],
    output: [
      { name: "id", type: "u64" },
      { name: "agent", type: "pubkey" },
      { name: "marketId", type: "bytes32" },
      { name: "isBuy", type: "bool" },
      { name: "size", type: "u64 (1e8)" },
      { name: "maxPrice", type: "u64 (1e6)" },
      { name: "expiresAt", type: "i64 (unix)" },
    ],
    category: "read",
    program: "a2a_darkpool",
  },
  {
    name: "sur.deposit",
    description: "Deposit USDC into the perp vault to back open positions.",
    input: [{ name: "amount", type: "u64 (6 decimals USDC)" }],
    output: [{ name: "signature", type: "string" }],
    category: "write",
    program: "perp_vault",
  },
  {
    name: "sur.withdraw",
    description: "Withdraw USDC from the perp vault back to the agent wallet.",
    input: [{ name: "amount", type: "u64 (6 decimals USDC)" }],
    output: [{ name: "signature", type: "string" }],
    category: "write",
    program: "perp_vault",
  },
  {
    name: "sur.open_position",
    description: "Open or extend a perp position on a given market.",
    input: [
      { name: "marketId", type: "bytes32" },
      { name: "sizeDelta", type: "i64 (1e8, signed)", note: "positive = long" },
      { name: "fillPrice", type: "u64 (1e6)" },
    ],
    output: [{ name: "signature", type: "string" }],
    category: "write",
    program: "perp_engine",
  },
  {
    name: "sur.close_position",
    description: "Close (or reduce) an open perp position at a target price.",
    input: [
      { name: "marketId", type: "bytes32" },
      { name: "fillPrice", type: "u64 (1e6)" },
    ],
    output: [{ name: "signature", type: "string" }],
    category: "write",
    program: "perp_engine",
  },
  {
    name: "sur.post_intent",
    description: "Post an OTC dark-pool intent for other agents to respond to.",
    input: [
      { name: "marketId", type: "bytes32" },
      { name: "isBuy", type: "bool" },
      { name: "size", type: "u64 (1e8)" },
      { name: "minPrice", type: "u64 (1e6)" },
      { name: "maxPrice", type: "u64 (1e6)" },
      { name: "duration", type: "i64 (seconds)" },
    ],
    output: [
      { name: "signature", type: "string" },
      { name: "intentId", type: "u64" },
    ],
    category: "intent",
    program: "a2a_darkpool",
  },
  {
    name: "sur.accept_intent",
    description:
      "Respond to an open intent at its max price; intent creator settles atomically.",
    input: [
      { name: "intentId", type: "u64" },
      { name: "price", type: "u64 (1e6)" },
      { name: "duration", type: "i64 (seconds)" },
    ],
    output: [{ name: "signature", type: "string" }],
    category: "intent",
    program: "a2a_darkpool",
  },
] as const;

export function toolsByCategory(category: ToolCategory): McpTool[] {
  return MCP_TOOLS.filter((t) => t.category === category);
}
