# Formatted Staff email and attachments

Available to the existing owner/administrator mail roles under **Staff → Email & newsletter**.

## Compose and reply

- Use bold, italic, underline, paragraphs and numbered or bulleted lists.
- Insert links with the **Link text** and **Link address** fields. Only HTTP,
  HTTPS and mailto links are accepted; links with embedded credentials are rejected.
- **Preview** shows the formatted body; **Text fallback** shows the approximate
  alternative. The server sanitizes the HTML and derives the actual plain-text
  alternative, including link destinations. Both alternatives are sent.
- Attach up to three nonempty PDF, PNG, JPEG, TXT or CSV files, at most **1 MB
  each and 2 MB combined**. File bytes, not just extensions, are checked.
  Other types, including executable files and archives, require a trusted file link.
- Files remain transient in the browser draft until sending and are delivered
  as real MIME attachments. They are not persisted to PostgreSQL or a separate
  public upload bucket. The mail provider may retain the delivered and Sent copies.
- Fields and navigation are locked while sending, and Send waits for selected
  files to finish loading. Drafts and their send identity survive correspondence
  tab changes but not a full reload.
- An accepted SMTP result is not proof of inbox delivery. An uncertain or in-flight
  result keeps the draft and its identity. Check send history and webmail before
  explicitly sending as a new message; a same-identity retry cannot duplicate it.

## Incoming and Sent mail

- Formatted mail is server-sanitized and displayed in a sandboxed frame.
  Scripts, forms, remote images, tracking pixels, embedded content and sender CSS
  are excluded. Safe hyperlinks open a separate tab; a plain-text view remains available.
- Attachments are fetched only when **Download** is clicked, through authenticated
  Staff access. The mailbox's UID-validity fence is rechecked before each download.
- Whole-message preview is limited to 4 MB of encoded mail; each attachment
  download is limited to 2 MB. Larger messages must be opened in webmail.
  Downloads use private/no-store, attachment disposition and nosniff.
- No antivirus scanner is provided. Only open attachments from trusted senders.
  A permitted extension or matching signature is not a malware-free guarantee.

## Campaigns

- New campaign drafts support the same formatted body. Existing text-only campaigns
  remain readable and sendable.
- The consent explanation and unsubscribe link are appended to **both** alternatives;
  the existing unsubscribe header, confirmed-consent checks, audience lock,
  three-recipient batch and hosting quota protections remain.
- Use a hosted file hyperlink rather than attaching files to every subscriber.
  Repeated attachments increase transfer and mailbox storage and can worsen spam
  filtering. Links also let recipients choose whether to download.

## Compatibility and operational limits

Email apps render HTML differently. Formatting is intentionally conservative:
semantic text and links rather than scripts, custom CSS, remote fonts or image layouts.
Pasted content is converted to plain text. Outgoing attachment support is not a
general-purpose file-sharing service. Mail delivery still depends on hosting limits.

The only persistent schema addition is the nullable campaign `body_html` column in
`0018_mail_html.sql`; old campaign, subscriber and encrypted mailbox data are retained.
Mail's existing lazy schema initialization includes the same idempotent addition.
Only the direct-send endpoint accepts a 3 MB JSON envelope; unrelated endpoint
budgets are unchanged.

## Verification

```sh
pnpm --filter @workspace/api-spec run codegen
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/soso-store run typecheck
pnpm --dir scripts exec tsx --test \
  ../artifacts/api-server/src/lib/staff-mail-content.test.ts \
  ../artifacts/api-server/src/lib/staff-mail-security.test.ts \
  ../artifacts/soso-store/src/lib/staff-mail-html.test.ts
pnpm run test:migrations
node lib/db/scripts/run-in-isolated-soso-schema.mjs \
  pnpm --dir scripts exec tsx --test \
  ../artifacts/api-server/src/routes/newsletter-groups.test.ts
```

The MIME round-trip uses a local stream transport, not SMTP. Integration tests use a
disposable schema and pre-reserved send identities, never real deliveries.
