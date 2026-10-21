import fs from "node:fs/promises";
import { pool } from "@workspace/db";
import { recoverVerificationImports } from "../src/lib/verification-import-recovery";
import { createMediaStorageService } from "../src/lib/media-storage";

try {
  const file = process.argv[2];
  if (!file) throw new Error("A retained verification manifest is required");
  const result = await recoverVerificationImports(
    JSON.parse(await fs.readFile(file, "utf8")), createMediaStorageService(),
    process.argv.includes("--discard-verification-draft-history"),
  );
  console.log(`IMPORT_RECOVERY_RESULT:${JSON.stringify(result)}`);
  if (result.state === "blocked") process.exitCode = 1;
} catch {
  console.error("Retained verification cleanup refused; the isolated schema and owned ledger must be preserved.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
