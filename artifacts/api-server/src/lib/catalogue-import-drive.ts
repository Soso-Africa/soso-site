import { ReplitConnectors } from "@replit/connectors-sdk";
import type { CatalogueImportDriveFolder, CatalogueImportDrivePhoto } from "@workspace/api-zod";

export const MAX_IMPORT_PHOTO_BYTES = 12 * 1024 * 1024;
const idPattern = /^[A-Za-z0-9_-]{10,160}$/;
const photoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export class CatalogueDriveError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}
export type DriveProxy = (path: string) => Promise<Response>;
type Proxy = DriveProxy;

export async function driveRead(path: string): Promise<Response> {
  // Workspace OAuth must never be copied to Vercel or exposed to the browser.
  if (process.env.VERCEL || process.env.NODE_ENV === "production" || (!process.env.REPL_IDENTITY && !process.env.WEB_REPL_RENEWAL)) {
    throw new CatalogueDriveError("Connected Drive access is available in the Replit workspace only. Download the product folders from Drive and use local photo selection on this host.", 503);
  }
  const connector = new ReplitConnectors();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      connector.proxy("google-drive", path, { method: "GET" }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new CatalogueDriveError("Drive request timed out. Retry this folder or photo.", 504)), 25_000); }),
    ]);
  } finally { clearTimeout(timer); }
}

function validateId(id: string) {
  if (!idPattern.test(id)) throw new CatalogueDriveError("Invalid Drive folder or file ID.", 400);
}

async function json<T>(proxy: Proxy, path: string): Promise<T> {
  const response = await proxy(path);
  if (!response.ok) {
    await response.body?.cancel();
    const status = response.status;
    throw new CatalogueDriveError(status === 404 ? "Drive item is missing or this connected account cannot access it."
      : status === 401 || status === 403 ? "Drive denied access. Check the connected account, sharing and download permissions."
      : status === 429 ? "Drive is rate-limited. Retry this group later." : "Drive could not read this item. Retry.", status === 404 ? 404 : status === 429 ? 429 : 502);
  }
  return await response.json() as T;
}

type DriveFile = { id: string; name: string; mimeType: string; size?: string; md5Checksum?: string; modifiedTime?: string; parents?: string[]; trashed?: boolean; capabilities?: { canDownload?: boolean } };

export async function scanDriveFolder(folderId: string, proxy: Proxy = driveRead): Promise<CatalogueImportDriveFolder> {
  validateId(folderId);
  const folder = await json<DriveFile>(proxy, `/drive/v3/files/${folderId}?supportsAllDrives=true&fields=id,name,mimeType,trashed`);
  if (folder.trashed || folder.mimeType !== "application/vnd.google-apps.folder") throw new CatalogueDriveError("Choose a non-trashed product folder, not a file or shortcut.", 400);
  const files: CatalogueImportDrivePhoto[] = [], warnings: string[] = [];
  let pageToken: string | undefined;
  let pages = 0, entries = 0;
  do {
    if (++pages > 10) throw new CatalogueDriveError("Folder listing exceeded its page budget. Choose an individual product folder.", 400);
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken,incompleteSearch,files(id,name,mimeType,size,md5Checksum,modifiedTime,capabilities(canDownload))",
      supportsAllDrives: "true", includeItemsFromAllDrives: "true", pageSize: "100", orderBy: "name_natural",
      ...(pageToken ? { pageToken } : {}),
    });
    const result = await json<{ files: DriveFile[]; nextPageToken?: string; incompleteSearch?: boolean }>(proxy, `/drive/v3/files?${params}`);
    if (result.incompleteSearch) throw new CatalogueDriveError("Drive returned an incomplete folder listing. Retry before accepting this group.");
    for (const file of result.files ?? []) {
      if (++entries > 400) throw new CatalogueDriveError("Too many folder entries. Choose an individual product folder.", 400);
      if (!photoTypes.has(file.mimeType)) { warnings.push(`Not imported: ${file.name} (not a JPEG, PNG or WebP photo).`); continue; }
      const size = Number(file.size);
      if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_IMPORT_PHOTO_BYTES || file.capabilities?.canDownload === false) {
        warnings.push(`Not imported: ${file.name} (download unavailable or exceeds 12 MiB).`); continue;
      }
      files.push({ id: file.id, name: file.name, size, mimeType: file.mimeType, ...(file.md5Checksum ? { md5Checksum: file.md5Checksum } : {}), ...(file.modifiedTime ? { modifiedTime: file.modifiedTime } : {}) });
      if (files.length > 200) throw new CatalogueDriveError("More than 200 photos in one group. Choose individual product folders.", 400);
    }
    pageToken = result.nextPageToken;
    if (warnings.length > 200) throw new CatalogueDriveError("Too many non-photo items. Choose an individual product folder.", 400);
  } while (pageToken);
  if (!files.length) warnings.push("No downloadable supported photos were found.");
  return { folderId, name: folder.name, files, warnings };
}

export async function readDrivePhoto(folderId: string, fileId: string, proxy: Proxy = driveRead): Promise<{ bytes: Buffer; mimeType: string }> {
  validateId(folderId); validateId(fileId);
  const file = await json<DriveFile>(proxy, `/drive/v3/files/${fileId}?supportsAllDrives=true&fields=id,name,mimeType,size,parents,trashed,capabilities(canDownload)`);
  if (file.trashed || !file.parents?.includes(folderId)) throw new CatalogueDriveError("Photo no longer belongs to the selected product folder. Scan it again.", 409);
  if (!photoTypes.has(file.mimeType) || !Number.isSafeInteger(Number(file.size)) || Number(file.size) <= 0
    || Number(file.size) > MAX_IMPORT_PHOTO_BYTES || file.capabilities?.canDownload === false) throw new CatalogueDriveError("This photo cannot be downloaded or exceeds 12 MiB.", 400);
  const response = await proxy(`/drive/v3/files/${fileId}?supportsAllDrives=true&alt=media`);
  if (!response.ok || !response.body) { await response.body?.cancel(); throw new CatalogueDriveError("Photo download failed. Retry this photo."); }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  const timeout = setTimeout(() => { void reader.cancel("Download timed out"); }, 25_000);
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_IMPORT_PHOTO_BYTES) throw new CatalogueDriveError("Photo exceeds the 12 MiB download budget.", 400);
      chunks.push(Buffer.from(part.value));
    }
    const bytes = Buffer.concat(chunks);
    if (size !== Number(file.size)) throw new CatalogueDriveError("Photo changed or the download was interrupted. Scan and retry.");
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isWebp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
    if (!(file.mimeType === "image/jpeg" && isJpeg || file.mimeType === "image/png" && isPng || file.mimeType === "image/webp" && isWebp)) throw new CatalogueDriveError("Photo bytes do not match their declared image type.", 400);
    return { bytes, mimeType: file.mimeType };
  } finally { clearTimeout(timeout); await reader.cancel().catch(() => undefined); }
}
