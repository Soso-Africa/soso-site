# SOSO-owned shopper authentication

Shopper login uses SOSO's database and hosting mailbox. Clerk is no longer part
of the shopper runtime. Staff authentication is separate and unchanged. No
managed Clerk tenant or its user records have been deleted.

## Signed-in devices

- `/account/sessions` lists only the signed-in shopper's unexpired sessions.
  It does not require a linked commerce customer or verified email.
- Labels are coarse browser/device hints, not verified identity or location.
  Raw user agents and IP addresses are not stored with sessions. Last activity
  is updated at most every five minutes; sessions expire after fourteen days.
- A shopper can revoke another device using a non-credential session ID.
  Signing out all other devices or everywhere requires the current password
  each time, with five attempts per shopper per fifteen minutes.
- Writes require same-origin proof. Ownership and expiry are rechecked under
  the same user lock as login and password recovery; session lists contain no
  cookie tokens or token hashes.
- Signing out everywhere clears this device's shopper cookie. Other tabs
  refresh through the existing privacy signal; other devices detect revocation
  on their next request, focus, or the account's one-minute session check.
  Staff sessions and guest carts are not revoked.

## Hosting requirements

- Use the existing SOSO PostgreSQL database. The production Vercel build runs
  `ensure-shopper-schema.mjs`, applying only the additive customer-binding and
  owned-auth migrations. It verifies existing columns and identity constraints
  and fails if they are incompatible. It never runs the database test suite
  or the full migration history against production.
- Configure and test the hosting mailbox in **Staff → Mail**. It must be
  enabled, its current settings must have passed the connection test, and the
  owner must confirm the provider's hourly sending allowance.
- Keep the existing mailbox encryption `SESSION_SECRET` stable and configured
  on the hosting server. Never paste it into source or chat.
- Set the mailbox public origin to the approved HTTPS storefront origin.
  Security mail does not require newsletter sending to be enabled or marketing
  consent, but it shares the mailbox's conservative hourly allowance.
- HTTPS is required. Production uses a host-only `__Host-` cookie with Secure,
  HttpOnly and SameSite=Lax. Browser identity is never stored in localStorage.

If mail is missing, paused, untested or over allowance, account email cannot be
promised. Registration and recovery check mailbox readiness before proceeding.
SMTP uncertainty is recorded in Staff send history; public responses stay
generic to avoid revealing which addresses are registered. SMTP acceptance is
not proof of inbox delivery. Qualify verification and reset delivery using
owner-approved real inboxes before activating shopper signup on the live site.

## Security boundaries

- Passwords contain 12–128 characters and are salted with scrypt. Passwords are
  never sent to JusticeSure, logged, or saved by the browser.
- Database sessions last at most 14 days. Only SHA-256 hashes of random session
  secrets and one-time verification/recovery secrets are stored.
- Login, registration, email requests and link confirmation have shared,
  database-backed attempt limits. Shopper writes require same-origin proof.
- Email confirmation expires after 60 minutes; recovery expires after 30.
  Links keep secrets in URL fragments, remove them from the address bar, and
  require explicit confirmation rather than consuming on page load.
- Reset consumes the token under the user lock, changes the password, invalidates
  all previous tokens, and revokes every shopper session. A concurrent login
  that checked the old password cannot mint a new session afterward.
- Verification also requires the password chosen at signup. A person cannot
  pre-register someone else's email with a known password and gain verified
  access when the email owner later opens the link. If that signup password
  is not yours, use email-based password recovery instead.
- Pending-email sessions may check out only as unlinked guests. Only a
  server-verified email may access or link a JusticeSure customer.
- Customer identity uses an immutable SOSO issuer and user UUID. Do not merge
  pre-existing Clerk-bound or JusticeSure customer records solely by email.
  Any existing-account migration requires explicit ownership review.
- Live JusticeSure customer permissions and Test customer permissions are
  separate release gates. Owned login does not grant missing merchant API scope.

## Local qualification

- `pnpm --filter @workspace/api-server run test:shopper-auth` exercises real
  database sessions and one-time tokens in a temporary isolated schema.
- `pnpm --filter @workspace/db run test:migrations` covers fresh, legacy and
  repeated migrations, bounded hosted preparation, identity preservation and
  incompatible-schema refusal.
- For browser testing only:
  `node lib/db/scripts/run-in-isolated-soso-schema.mjs pnpm --dir scripts exec tsx ../artifacts/api-server/scripts/owned-shopper-browser-fixture.ts`
  starts a loopback-only fixture on port 6607. It refuses non-test schemas.
  The fixture uses real authentication handlers but synthetic email delivery
  and synthetic JusticeSure customer responses. It is not live delivery or
  merchant-permission evidence. Stop it after testing so its schema is removed.

The login itself has no per-shopper third-party authentication subscription.
Database, hosting and email quotas still apply.
