/**
 * WCAG contrast verification for the Sandwich Index token palette.
 *
 * "Body text meets 4.5:1" is a Definition of Done item, and the only way to
 * claim it honestly is to compute it. Run: node scripts/check-contrast.mjs
 * Exits non-zero if any declared pair fails, so it can gate a build.
 */

const TOKENS = {
  paper: "#fbfaf7",
  paperRaised: "#ffffff",
  paperSunken: "#f2efe8",
  ink: "#15140f",
  inkMuted: "#524f45",
  inkSubtle: "#6b675b",
  accent: "#12395e",
  accentInk: "#ffffff",
  tierLow: "#0f5c55",
  tierMid: "#8a5a12",
  tierHigh: "#7b2d3b",
  stale: "#6b675b",
  danger: "#9a2515",
  paperMuted: "#c9c4b6",
};

/** WCAG 2.1 relative luminance. */
function luminance(hex) {
  const channels = [1, 3, 5].map((i) => {
    const value = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = channels;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/** [foreground, background, minimum ratio, what it is used for] */
const PAIRS = [
  ["ink", "paper", 4.5, "body text on page background"],
  ["ink", "paperRaised", 4.5, "body text on cards"],
  ["ink", "paperSunken", 4.5, "body text on footer"],
  ["inkMuted", "paper", 4.5, "secondary body copy"],
  ["inkMuted", "paperSunken", 4.5, "footer secondary copy"],
  ["inkSubtle", "paper", 4.5, "eyebrow and caption text"],
  ["accent", "paper", 4.5, "links on page background"],
  ["accentInk", "accent", 4.5, "button label on accent fill"],
  ["tierLow", "paper", 4.5, "cheapest-tier label text"],
  ["tierMid", "paper", 4.5, "mid-tier label text"],
  ["tierHigh", "paper", 4.5, "priciest-tier label text"],
  ["accentInk", "tierLow", 4.5, "marker label on cheapest fill"],
  ["accentInk", "tierMid", 4.5, "marker label on mid fill"],
  ["accentInk", "tierHigh", 4.5, "marker label on priciest fill"],
  ["stale", "paper", 4.5, "stale indicator text"],
  ["danger", "paper", 4.5, "inline validation error text"],
  ["accent", "paper", 3.0, "focus ring against page background"],
  // The landing page turns the palette over for its closing band.
  ["paper", "ink", 4.5, "inverted band body text"],
  ["paperMuted", "ink", 4.5, "inverted band secondary copy"],
  ["ink", "paper", 4.5, "inverted band button label on paper fill"],
  ["paper", "ink", 3.0, "focus ring inside the inverted band"],
  ["paperMuted", "ink", 3.0, "outlined button border on ink"],
];

let failed = 0;
const rows = PAIRS.map(([fg, bg, min, use]) => {
  const ratio = contrast(TOKENS[fg], TOKENS[bg]);
  const pass = ratio >= min;
  if (!pass) failed += 1;
  return { pair: `${fg} on ${bg}`, ratio: ratio.toFixed(2), min: min.toFixed(1), pass: pass ? "PASS" : "FAIL", use };
});

const width = Math.max(...rows.map((r) => r.pair.length));
for (const row of rows) {
  console.log(
    `${row.pass === "PASS" ? "  ok  " : " FAIL "} ${row.pair.padEnd(width)}  ${row.ratio.padStart(6)}:1  (min ${row.min})  ${row.use}`,
  );
}

console.log(`\n${rows.length - failed}/${rows.length} pairs pass.`);
process.exit(failed > 0 ? 1 : 0);
