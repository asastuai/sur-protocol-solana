import { ImageResponse } from "next/og";

export const alt = "SUR Protocol — Agent-native perpetual DEX on Solana";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          background: "#0a0a0a",
          padding: "80px",
          fontFamily: "monospace",
        }}
      >
        <div
          style={{
            fontSize: 22,
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            color: "#c9a227",
          }}
        >
          // SUR Protocol
        </div>
        <div
          style={{
            marginTop: 24,
            fontSize: 220,
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: "-0.04em",
            color: "#c9a227",
          }}
        >
          SUR
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 40,
            color: "#f5f5f5",
          }}
        >
          Agent-native perpetual DEX on Solana
        </div>
        <div
          style={{
            marginTop: 56,
            paddingTop: 24,
            borderTop: "2px dashed #3a3a3a",
            width: "100%",
            display: "flex",
            fontSize: 22,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#9a9a9a",
          }}
        >
          SUR://devnet
        </div>
      </div>
    ),
    { ...size }
  );
}
