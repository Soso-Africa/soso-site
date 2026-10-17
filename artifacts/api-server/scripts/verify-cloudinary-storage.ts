import { createMediaStorageService } from "../src/lib/media-storage";

async function main(): Promise<void> {
  if (process.env.VERCEL_ENV !== "production") {
    console.log("Production media storage diagnostic skipped outside Vercel production.");
    return;
  }

  const storage = createMediaStorageService();
  const inspected = await storage.runDiagnostic();
  if (
    inspected.contentType !== "image/png"
    || inspected.declaredContentType !== "image/png"
    || !Number.isSafeInteger(inspected.size)
    || inspected.size < 1
  ) {
    throw new Error("Production media storage diagnostic returned invalid media metadata");
  }

  console.log(`${storage.provider} production storage diagnostic passed and cleaned up.`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Production media storage diagnostic failed");
  process.exit(1);
});