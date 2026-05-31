// Shared external links and app-level branding constants.
//
// Single source of truth for footer links, share metadata, and the
// "Powered by Solana" surfaces. Other agents import these from
// "@/lib/constants" — do not hard-code these URLs elsewhere.

/** Canonical GitHub repository (placeholder org until Juan confirms). */
export const SUR_GITHUB_URL = "https://github.com/asastuai/sur-protocol-solana";

/** In-app docs route. Served by the web app, not an external host. */
export const SUR_DOCS_URL = "/docs";

/** Project presence on X / Twitter. */
export const SUR_X_URL = "https://x.com/surprotocol";

/** Community Discord invite. */
export const SUR_DISCORD_URL = "https://discord.gg/surprotocol";

/** Display name shown in the header, footer, and share cards. */
export const APP_NAME = "SUR Protocol";

/** One-line positioning statement used in hero + OG metadata. */
export const APP_TAGLINE = "Agent-native perpetuals on Solana";
