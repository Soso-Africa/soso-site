import type { CatalogueGoogleStatus } from "@workspace/api-client-react";

/** UI guidance only. The server still rechecks configuration, session and folder grants. */
export function driveScanBlocker(status: CatalogueGoogleStatus | null, folderIds: string[]): string | null {
  if (!status) return "Checking Google Drive. You can add photos from your device below without connecting Google.";
  if (folderIds.length === 0) return "No spreadsheet Drive folder is selected. You can add photos from your device below.";
  if (status.workspace) return null;
  if (!status.configured) return "Google Drive is not set up on this site. Use Add files or Add folder below, then assign the photos to a product. Scanning does not connect Google.";
  if (!status.connected) return "Connect Google Drive in the connection panel above, then select this product’s spreadsheet folder. Or add photos from your device below.";
  if (status.expiresAt && new Date(status.expiresAt).getTime() <= Date.now()) return "Your Google Drive connection has expired. Reconnect above or add photos from your device below.";
  if (folderIds.some((id) => !status.folders.includes(id))) return "In the Google Drive panel above, choose Select this spreadsheet folder for each product you want to scan. Connecting Google alone does not select its folders.";
  return null;
}
