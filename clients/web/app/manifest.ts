import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SUR Protocol",
    short_name: "SUR",
    description:
      "Agent-native perpetual futures DEX on Solana.",
    start_url: "/",
    display: "standalone",
    theme_color: "#0a0a0a",
    background_color: "#0a0a0a",
    icons: [
      {
        src: "/icon.svg",
        type: "image/svg+xml",
        sizes: "any",
      },
    ],
  };
}
