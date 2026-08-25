import { CloudinaryStorageService } from "../src/lib/cloudinary-storage";

async function main(): Promise<void> {
  if (process.env.VERCEL_ENV !== "production") {
    console.log("Cloudinary production storage diagnostic skipped outside Vercel production.");
    return;
  }

  const inspected = await new CloudinaryStorageService().runDiagnostic();
  if (
    inspected.contentType !== "image/png"
    || inspected.declaredContentType !== "image/png"
    || !Number.isSafeInteger(inspected.size)
    || inspected.size < 1
  ) {
    throw new Error("Cloudinary production storage diagnostic returned invalid media metadata");
  }

  console.log("Cloudinary production storage diagnostic passed and cleaned up.");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Cloudinary production storage diagnostic failed");
  process.exit(1);
});