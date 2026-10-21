# Staff bulk catalogue import

Open **Staff → Platform content → Catalogue → Bulk catalogue import · pilot**.

## Production quick start

Sign in at **https://shopsoso.co/staff** with an owner, admin or editor account that can manage catalogue content. Open **Platform content → Catalogue → Bulk catalogue import · pilot → Production bulk-upload guide**. The guide is available inside Staff; repository access is not required.

Two supported photo sources:

- **Local folders:** download the product folders from Drive, extract ZIP downloads on your computer, select the folders/files in Staff and explicitly assign them to spreadsheet groups. This does not require a Google OAuth application and is the fallback if Google is not configured or a connection expires.
- **Direct Google Drive:** the hosting operator must complete the separate setup below first. Then each Staff session connects the intended Google account and explicitly selects its spreadsheet-linked folders. The workspace's existing Google connection is not sufficient.

For the first live use, import **five new products**. After the success message, reload Catalogue and check all five names, departments, collections, covers and galleries. Confirm they are placeholders/unavailable and that the storefront has not changed. Continue in batches of at most ten only after those checks.

**Deploying this software is not product publication.** To make an imported item sellable later, separately confirm its business facts, stock/fulfilment, exact JusticeSure prices and variant mappings, complete the existing product approval checks, and deliberately publish it. Never approve the internal price `1` as a real selling price.

## Review and import

1. Save or discard unrelated catalogue edits before importing.
2. Select the existing `.xlsx` workbook or a UTF-8 `.csv` export, up to 650 KiB. The supplied workbook's product sheet and column headings are supported without rearranging it.
3. Select a small batch. Five new rows are initially selected; each save accepts at most ten products.
4. Scan the selected Drive product folders after connecting Google and selecting them for this Staff session. If Google is unavailable, download and extract the folders yourself and select them through the local folder/file controls. Local folders must be explicitly assigned to a product group.
5. Review each group's department and collection. Only exact department/category matches are prefilled. Resolve unisex explicitly. If the correct collection does not exist, create and save it with the existing Collections editor first; do not choose an unrelated collection just to pass validation.
6. Review actual photos, select the cover, set gallery order, exclude unsuitable photos, enter accurate rights information, and assign genuine colour photos where known. Photo numbering alone does not approve a cover or establish front/back pairs.
7. Optionally apply atelier-confirmed fabric, fit, sizes, colours or rights to the selected groups. Blank shared fields leave their current values unchanged. Spreadsheet claims remain unverified draft copy.
8. Accept each reviewed group, then choose **Upload & save as drafts**. Photos upload sequentially through the existing governed media pipeline. Failed photos can be retried individually. A group is marked saved only after the draft save is acknowledged.

## Safety and recovery

- This pilot adds **new slugs only**. Existing products are not replaced, cleared or deleted.
- Every imported product is a non-selling placeholder with unavailable fulfilment, no JusticeSure mapping and no Standard/Custom eligibility.
- The internal price value of `1` and size `To confirm` satisfy the existing draft schema only. They are not confirmed merchant prices or sizes. The imported product note explicitly says **PRICE UNKNOWN**.
- Importing does not publish products, change published collections, approve stock/business claims, or enable checkout.
- Current Staff roles and the saved draft version are checked by the server. A stale draft or slug collision rejects the save rather than overwriting another person's work.
- Review metadata and content-hash upload identities are stored on the server, scoped to the signed-in Staff identity. IndexedDB is only a best-effort cache. The same Staff account can restore its current review on another device; different Staff accounts cannot see its recovery records.
- Local file access is not transferred between devices: reselect files when prompted. Completed, owned uploads are verified before reuse. Clearing browser data does not delete the server ledger, and legacy local-only receipts are not silently trusted.
- If another device changes the review, saving fails with a conflict rather than overwriting it. Reopen Staff to restore the latest server review before continuing. If server recovery is unavailable, uploading pauses explicitly.
- **Upload recovery** lists current owned records. Cleanup is an explicit, per-record action: it rechecks live references under a lock, and refuses referenced objects or uploads with a still-valid authorization. A newly authorized upload may need to wait at least two hours; a withheld cleanup is not permission to delete the object elsewhere.
- If a save response is lost, reload the saved catalogue before retrying. A failed acknowledgement does not prove the server did not commit.

## Hosting boundary

The Replit workspace connector and the independently hosted Staff connection are separate. Never copy workspace identity, connector credentials or tokens to Vercel. Production builds exclude the connector implementation, and both production runtime and Vercel explicitly refuse the workspace reader even if workspace identity variables are present.

### Published Staff host setup

Create a **separate Google Cloud OAuth web application** for SOSO Staff, enable the Google Drive API, configure its consent screen and authorized Staff/test users, and register this exact redirect:

`https://shopsoso.co/api/staff/catalogue-import/google/callback`

Set these values through the published host's environment/secrets controls (never in source code or browser variables):

- `GOOGLE_DRIVE_CLIENT_ID`: OAuth web application's client ID.
- `GOOGLE_DRIVE_CLIENT_SECRET`: its client secret.
- `GOOGLE_DRIVE_REDIRECT_URI`: the exact HTTPS callback above, without query or fragment.
- `SESSION_SECRET`: the existing stable server encryption secret, at least 32 characters.

Use the actual approved Staff origin, not a development or guessed production URL. Each preview host needs its own explicitly registered callback/configuration. There is no API key or Google browser SDK to configure: SOSO's Staff folder picker uses server-side Drive API reads, and never receives a Google bearer token.

If any of these settings is missing, do not describe direct Drive as activated. The Staff panel must show its configuration/unavailable message and the local-folder route must remain usable. The existing Replit Google connection cannot supply these application credentials.

The **only** requested scope is `https://www.googleapis.com/auth/drive.readonly`. It permits viewing/downloading the Google account's Drive files, not writing or deleting them. Google has no read-only per-folder scope; `drive.file` permits modifications and selecting a folder does not grant access to its existing children. Staff see the wider read permission before connecting, while SOSO applies its own session-scoped folder allow-list. This is a restricted Google scope; satisfy Google's applicable consent/verification/security-assessment requirements before general release. An external app in testing must explicitly list the authorized Google test accounts. Do not bypass Google's warnings or claim an unverified app is approved.

### Using direct Drive

1. Open the importer, read the spreadsheet and choose **Connect Google Drive**. The current review must successfully commit to browser storage before leaving; if storage is unavailable, save the batch or keep using local folders.
2. Sign in to the intended Google account and consent. Google returns to Staff's Catalogue importer. Cancellation, expired state or invalid authorization shows a reconnect/local-folder recovery message.
3. In the read-only folder picker, find a folder by name or choose **Select this spreadsheet folder** for the exact linked folder ID. Only folders linked by the current spreadsheet are offered for import selection. Missing/inaccessible folders and shortcuts are rejected.
4. Scan the corresponding spreadsheet groups, review photos and save drafts as before. Every photo download rechecks that the photo is still a direct child of the selected folder.
5. Use **Disconnect Drive** to remove credentials and folder grants for this Staff session and request Google revocation. If Google revocation fails, SOSO stays disconnected and instructs Staff to remove the app in Google Account third-party connections. Revoking a Google grant may affect other SOSO sessions for that Google account; those sessions must reconnect.

Authorization uses single-use, ten-minute state bound to the active Staff session plus PKCE. Access tokens and PKCE verifiers are encrypted using context-separated AES-GCM, with per-session authenticated bindings, in `soso_catalogue_drive_sessions`. No refresh token is requested or retained. Connections expire within one hour (or earlier if Google expires them); expired rows are removed on the next Drive operation. Logging out does not make a connection available to the next login: a new Staff session must authorize again. Disconnect before logging out when immediate Google revocation is desired.

The additive credential table is initialized on the first configured Drive operation, using the same runtime-schema pattern as Staff mail. The runtime database role must be allowed to create this table/index, or an operator must pre-create the exact schema from `DRIVE_OAUTH_SCHEMA` in `artifacts/api-server/src/lib/catalogue-drive-oauth.ts`. Unavailable configuration/schema fails explicitly; local uploads are unchanged.

The folder picker returns up to 50 folders per search, and selection is limited to 200 folders per Staff session. Product scans are bounded to 10 pages / 400 entries / 200 photos, with individual downloads limited to 12 MiB and bounded request/body timeouts. The existing two-concurrent-photo limit and image-byte checks still apply. No imported content bypasses media governance, draft-only saves, publication approval or checkout mapping gates.

## Verification

### Production release checklist

1. Prepare only the importer changes on the latest GitHub `main`; preserve unrelated checkout, payments, domain and hosting changes. Do not publish the whole workspace branch.
2. Pass the current Vercel client-review gate and production-mode server bundle checks. Production bundles must not contain the Replit workspace connector transport.
   The production build prepares only the additive catalogue recovery migration and verifies its columns, constraints and lookup index. It does not run the full migration queue. Preview builds skip database preparation. If production schema preparation is refused, investigate the mismatch before retrying; do not bypass it.
3. Qualify import/save/reload in an isolated database with an exact-path test-media journal. Do not create a trial catalogue in production without explicit approval, and never delete test media by broad prefix or timestamp.
4. Review the Vercel result for the exact release commit. An older working site or a redirected Vercel login screen is not evidence that this release works.
5. After the approved GitHub/Vercel release, verify `/api/healthz`, a hard-refresh storefront page, `/staff`, and the Staff-only import endpoints' authentication boundaries. Sign in and confirm the in-app guide and local-folder controls are present. If Google is configured, separately qualify real consent, folder selection, import and disconnect using an authorized account.
6. Keep all imported products unpublished and non-selling until their individual catalogue approval checks are deliberately completed.

Focused tests cover workbook/CSV parsing, archive budgets, Drive parent membership and image-byte checks, category resolution, genuine colour previews, sequential downloads, duplicate/conflict guards, and atomic five-product draft saves with unchanged publication.

The browser pilot script is `artifacts/soso-store/scripts/test-catalogue-import-browser.mjs`. Run it only through the isolated-schema wrapper, never against the regular application database. It reads real Drive photos and performs real managed uploads. The server journals exact authorized paths before returning upload authorization; browser response tracking is supplementary. After restoring isolated references, cleanup may be deferred until authorizations expire. The wrapper retains unresolved owned ledgers and prints a resumable recovery command. Keep that schema and evidence until the guarded recovery command confirms deletion; never force-delete by prefix or timestamp. Use a unique run ID/output directory under `generated-artifacts/`, outside Git and deployment outputs.
