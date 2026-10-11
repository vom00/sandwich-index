"use client";

/**
 * The boundary of last resort: the root layout itself failed.
 *
 * This replaces the whole document, so it has to supply its own `<html>` and
 * `<body>` — and it cannot rely on anything the layout provides. No fonts, no
 * design tokens, no Tailwind classes, because the stylesheet is imported by the
 * layout that just crashed. Everything below is inline, on purpose.
 *
 * The colours are the literal values of `--color-paper` and `--color-ink`. This
 * is the one file in the codebase allowed to contain a raw hex.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          backgroundColor: "#fbfaf7",
          color: "#15140f",
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: "16px",
          lineHeight: 1.5,
          display: "flex",
          alignItems: "center",
        }}
      >
        <main style={{ margin: "0 auto", maxWidth: "34rem", padding: "2rem 1.25rem" }}>
          <h1 style={{ fontSize: "1.875rem", lineHeight: 1.15, margin: 0 }}>
            Sandwich Index could not start
          </h1>

          <p style={{ marginTop: "1rem", color: "#524f45" }}>
            Something failed before the page could be built. Reloading is worth a
            try; if it keeps happening, the site is broken rather than your
            connection.
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "2rem",
              minHeight: "48px",
              padding: "0.75rem 1.25rem",
              border: "2px solid #15140f",
              borderRadius: "6px",
              background: "#15140f",
              color: "#ffffff",
              font: "inherit",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reload
          </button>

          {error.digest !== undefined ? (
            <p style={{ marginTop: "2.5rem", fontSize: "0.875rem", color: "#6b675b" }}>
              Reference: <code>{error.digest}</code>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
