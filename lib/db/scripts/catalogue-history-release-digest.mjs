import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

// Qualification follows the actual writers/readers, not just a SQL version.
// A later code change invalidates the activation receipt. No env/config values
// or generated output are read, and this never connects to a database.
export async function catalogueHistoryReleaseDigest() {
  const hash = createHash("sha256");
  const root = new URL("../../../", import.meta.url);
  const visit = async (path) => {
    const entries = await readdir(new URL(path, root), { withFileTypes: true });
    for (const entry of entries.sort((a,b) => a.name.localeCompare(b.name))) {
      const child = `${path}${entry.name}`;
      if (entry.isDirectory()) await visit(`${child}/`);
      else if (/\.(ts|tsx|mjs|sql)$/.test(entry.name)) {
        hash.update(child); hash.update("\0"); hash.update(await readFile(new URL(child, root))); hash.update("\0");
      }
    }
  };
  for (const path of ["artifacts/api-server/src/", "lib/db/src/", "lib/db/migrations/", "lib/db/scripts/"]) await visit(path);
  return hash.digest("hex");
}
