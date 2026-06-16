"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          color: "#f5f5f5",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          padding: "1.5rem",
        }}
      >
        <div style={{ width: "100%", maxWidth: "32rem" }}>
          <div
            style={{
              marginBottom: "0.75rem",
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              color: "#c9a227",
            }}
          >
            // fatal error
          </div>
          <div
            style={{
              border: "1px dashed #3a3a3a",
              background: "#121212",
              padding: "2rem",
            }}
          >
            <h1
              style={{
                fontSize: "1.875rem",
                margin: 0,
                letterSpacing: "-0.01em",
                color: "#f5f5f5",
              }}
            >
              Something broke
            </h1>
            <p
              style={{
                marginTop: "1rem",
                fontSize: "0.875rem",
                color: "#9a9a9a",
              }}
            >
              An unexpected error interrupted the SUR terminal.
              {error?.digest ? ` Ref: ${error.digest}` : ""}
            </p>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                marginTop: "1.5rem",
                border: "1px solid #c9a227",
                background: "transparent",
                color: "#c9a227",
                padding: "0.5rem 0.75rem",
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.2em",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Retry
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
