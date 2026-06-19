/**
 * SUR API — leaderboard + points reads, plus the onboarding/whitelist route.
 * Reads are live as soon as the DB has data; /beta/signup is BUILD-AHEAD and
 * gated until the re-deploy lands (needs ADMIN_SECRET_KEY + a deployed mint).
 */
import Fastify from "fastify";
import { config } from "./config.js";
import { db } from "./db.js";

const app = Fastify({ logger: true });

app.get("/healthz", async () => ({ ok: true }));

// Public leaderboard (Tier-1 vanity + Tier-2 eligible columns; banned excluded by the view).
app.get("/leaderboard", async (req) => {
  const limit = Math.min(Number((req.query as any)?.limit ?? 100), 500);
  const r = await db.query(
    "select wallet, eligible_points, vanity_points, total_points from leaderboard limit $1",
    [limit],
  );
  return { rows: r.rows };
});

// Per-wallet points with the audit trail (basis) so scores are explainable.
app.get("/points/:wallet", async (req) => {
  const { wallet } = req.params as { wallet: string };
  const r = await db.query(
    `select epoch_id, category, points, tier, formula_version, basis
       from points_ledger where wallet = $1 order by epoch_id desc, category`,
    [wallet],
  );
  const total = r.rows.reduce((a, x) => a + Number(x.points), 0);
  return { wallet, total, entries: r.rows };
});

app.get("/epochs", async () => {
  const r = await db.query(
    "select id, starts_at, ends_at, formula_version, settled from epochs order by id desc",
  );
  return { rows: r.rows };
});

// BUILD-AHEAD: whitelist a wallet (operator + 5k USDC + gas). Disabled until the
// re-deploy provides a fresh mint + ADMIN_SECRET_KEY. See docs/POINTS-SYSTEM.md.
app.post("/beta/signup", async (_req, reply) => {
  if (!config.faucet.testUsdcMint || !process.env.ADMIN_SECRET_KEY) {
    return reply.code(503).send({
      error: "onboarding not yet enabled — pending devnet re-deploy (SBPFv3 activation)",
    });
  }
  // TODO(deploy): rate-limit by ip-hash/fingerprint; idempotent on-chain checks;
  //   setOperator(wallet) + mintTo 5k test USDC + SystemProgram.transfer gas SOL;
  //   record wallets row (whitelisted_at, signup_ip_hash, onboard_sigs).
  return reply.code(501).send({ error: "not implemented" });
});

app.listen({ port: config.port, host: "0.0.0.0" }).catch((e) => {
  app.log.error(e);
  process.exit(1);
});
