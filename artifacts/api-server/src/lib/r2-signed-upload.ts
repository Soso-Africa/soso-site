import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** R2 ignores metadata hoisted into query parameters; sign actual headers. */
export async function signR2MediaPut(
  client: S3Client,
  input: { bucket: string; key: string; contentType: string; size: number; metadata: Record<string, string> },
): Promise<{ uploadURL: string; uploadHeaders: Record<string, string> }> {
  const metadataHeaders = Object.fromEntries(Object.entries(input.metadata).map(([key, value]) => [`x-amz-meta-${key}`, value]));
  const uploadURL = await getSignedUrl(client, new PutObjectCommand({
    Bucket: input.bucket, Key: input.key, ContentType: input.contentType,
    ContentLength: input.size, IfNoneMatch: "*", Metadata: input.metadata,
  }), {
    expiresIn: 600,
    signableHeaders: new Set(["content-type", "content-length", "if-none-match"]),
    unhoistableHeaders: new Set(Object.keys(metadataHeaders)),
  });
  return { uploadURL, uploadHeaders: { "Content-Type": input.contentType, "If-None-Match": "*", ...metadataHeaders } };
}
