// Regenerates client/components/acres/icon-paths.ts from @material-symbols/svg-400.
//
// The glyph list is the one docs/design-system.md §6 and docs/components.md §3
// identify from the references (AGENTS.md §0). Path data is READ from the
// installed package, never transcribed by hand (AGENTS.md §10 rule 6).
//
//   node client/scripts/generate-icon-paths.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require.resolve("@material-symbols/svg-400/package.json");
const dir = pkg.replace(/package\.json$/, "outlined");

// Every board glyph is FILLED (docs/design-system.md §6), so every entry reads
// the `-fill` file. For glyphs with no enclosed counter the two files are
// byte-identical; for `record_voice_over`, `account_balance` and `palette` they
// are not, and the filled one is the one the comps draw.
const GLYPHS = [
  "cable",
  "check",
  "close",
  "show_chart",
  "record_voice_over",
  "public",
  "account_balance",
  "palette",
  "arrow_right",
  "arrow_left",
  "arrow_outward",
  "menu",
];

const VIEW_BOX = "0 -960 960 960";
const entries = GLYPHS.map((name) => {
  const svg = readFileSync(`${dir}/${name}-fill.svg`, "utf8");
  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1];
  if (viewBox !== VIEW_BOX) {
    throw new Error(`${name}: unexpected viewBox ${viewBox}`);
  }
  const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
  if (paths.length !== 1) {
    throw new Error(`${name}: expected 1 path, found ${paths.length}`);
  }
  return [name, paths[0]];
});

const version = JSON.parse(readFileSync(pkg, "utf8")).version;
const out = `// GENERATED FILE — do not edit by hand.
// Source: @material-symbols/svg-400@${version}, outlined/<name>-fill.svg (Apache-2.0).
// Regenerate with: node client/scripts/generate-icon-paths.mjs
//
// Every glyph shares one viewBox, so <Icon> can hardcode it.

export const ICON_VIEW_BOX = "${VIEW_BOX}" as const;

export const iconPaths = {
${entries.map(([n, d]) => `  ${n}:\n    "${d}",`).join("\n")}
} as const;

export type IconName = keyof typeof iconPaths;
`;

writeFileSync(new URL("../components/acres/icon-paths.ts", import.meta.url), out);
console.log(`wrote ${entries.length} glyphs from @material-symbols/svg-400@${version}`);
