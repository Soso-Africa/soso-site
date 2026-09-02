import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const weights = [400, 500, 600, 700];
const stylesheet = await readFile(resolve(root, "src/index.css"), "utf8");
const indexHtml = await readFile(resolve(root, "index.html"), "utf8");

const importedWeights = [...stylesheet.matchAll(/@fontsource\/montserrat\/latin-(\d+)\.css/g)]
  .map((match) => Number(match[1]))
  .sort((left, right) => left - right);

if (JSON.stringify(importedWeights) !== JSON.stringify(weights)) {
  throw new Error(`Montserrat must import only 400, 500, 600, and 700. Found: ${importedWeights.join(", ") || "none"}.`);
}

if (/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(`${stylesheet}\n${indexHtml}`)) {
  throw new Error("Montserrat must be served locally; remote Google Fonts references are not allowed.");
}

for (const alias of ["sans", "serif", "display"]) {
  if (!new RegExp(`--app-font-${alias}:\\s*\"Montserrat\"`, "i").test(stylesheet)) {
    throw new Error(`The ${alias} typography alias must resolve to Montserrat.`);
  }
}
if (!/@apply\s+font-sans\b/.test(stylesheet)) {
  throw new Error("The document body must inherit the Montserrat-backed sans alias.");
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(?:ts|tsx|css)$/.test(entry.name) ? [path] : [];
  }));
  return files.flat();
}
for (const file of await sourceFiles(resolve(root, "src"))) {
  const source = await readFile(file, "utf8");
  if (/\bfontFamily\s*:|font-family\s*:/i.test(source) && file !== resolve(root, "src/index.css")) {
    throw new Error(`Unexpected component-level font family override: ${file}`);
  }
}

for (const weight of weights) {
  const fontCss = await readFile(
    resolve(root, `node_modules/@fontsource/montserrat/latin-${weight}.css`),
    "utf8",
  );
  if (!/font-display:\s*swap/i.test(fontCss)) {
    throw new Error(`Montserrat ${weight} must use font-display: swap.`);
  }
}

console.log("Typography source contract passed.");