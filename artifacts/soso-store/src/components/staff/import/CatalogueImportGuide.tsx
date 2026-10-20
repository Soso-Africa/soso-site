import React from "react";

/** Kept inside the authenticated importer so production Staff do not need repository access. */
export function CatalogueImportGuide() {
  return (
    <details className="border border-border bg-background p-4 text-xs" data-testid="catalogue-import-guide">
      <summary className="min-h-10 cursor-pointer font-semibold text-primary">
        Production bulk-upload guide — spreadsheet and photos
      </summary>
      <p className="mt-2 text-muted-foreground">
        Start with five new products. This tool creates unpublished drafts, not live products.
        You need an owner, admin or editor Staff account with catalogue access.
      </p>
      <ol className="mt-3 list-decimal space-y-2 pl-5">
        <li><strong>Save existing edits.</strong> Save or discard unrelated catalogue edits before beginning.</li>
        <li><strong>Read the spreadsheet.</strong> Select your Excel (.xlsx) or CSV file, up to 650 KiB. Check product names, unique slugs and linked product folders. Existing slugs cannot be overwritten.</li>
        <li><strong>Choose how to add photos.</strong> If Google is configured, choose Connect Google Drive, authorize the intended account, select each spreadsheet folder and scan the selected groups. Otherwise download the photos from Drive, unzip them on your computer, then use the local folder/file controls below and explicitly assign each folder to its product.</li>
        <li><strong>Resolve classifications.</strong> Choose Men, Women or Accessories and an existing collection for each group. Unisex needs an explicit choice. If the right collection is missing, create and save it in Collections first. Do not select an unrelated collection just to continue.</li>
        <li><strong>Review the photos.</strong> Include only that product’s genuine photos, choose a cover, set gallery order and enter accurate image rights. Use JPEG, PNG or WebP, at most 12 MiB each and 40 included photos per group. Assign colour photos only when verified.</li>
        <li><strong>Apply confirmed facts.</strong> Shared fabric, fit, sizes, colours and rights affect only selected groups. Blank shared fields leave values unchanged. Do not guess price, stock, sizing or claims.</li>
        <li><strong>Accept and save.</strong> Accept each reviewed group, select no more than 10 ready products, then choose Upload &amp; save as drafts. Keep the page open while photos upload. Retry a failed photo individually instead of starting a second batch.</li>
        <li><strong>Confirm the result.</strong> Wait for the saved confirmation. Reload the saved catalogue and verify names, categories, covers and gallery order before continuing with the next batch.</li>
      </ol>
      <div className="mt-4 space-y-2 border-t border-border pt-3">
        <p><strong>Not for sale yet:</strong> imported products remain placeholder/unavailable, without JusticeSure mappings or checkout eligibility. The internal price 1 and size “To confirm” are schema placeholders, not approved values.</p>
        <p><strong>To release later:</strong> review the product in Catalogue, replace unconfirmed information, confirm fulfilment and exact JusticeSure variant prices/mappings, complete the existing approval checks, and deliberately publish the product. Importing and deploying this tool do not perform those steps.</p>
        <p><strong>Google unavailable or expired?</strong> Reconnect the intended account and select the folders again, or use local folders. A Replit workspace connection alone does not authorize the live Staff site.</p>
        <p><strong>Save failed or response lost?</strong> Reload the saved catalogue before retrying: the server may have committed the batch. Existing-slug and draft-version checks prevent duplicate or stale saves. Reselect local files if prompted; keep using the same Staff account for recovery.</p>
      </div>
    </details>
  );
}
