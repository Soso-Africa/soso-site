# Authenticated privacy access-package verification

Run this **only against development** after obtaining short-lived Clerk session
tokens for two active staff accounts: one `owner` and one non-owner. Do not use
production sessions or paste tokens into source control, chat, or shell history.
Store the values in temporary workspace secrets or your local process environment.

```sh
SOSO_PRIVACY_TEST_API_ORIGIN="https://your-development-domain" \
SOSO_PRIVACY_TEST_OWNER_TOKEN="short-lived-owner-session-token" \
SOSO_PRIVACY_TEST_NON_OWNER_TOKEN="short-lived-non-owner-session-token" \
pnpm --filter @workspace/api-server run verify:privacy-access-packages
```

`SOSO_PRIVACY_TEST_API_ORIGIN` is the storefront/API origin without a trailing
path (for example, the development domain). The command uses `DATABASE_URL`
already configured for development.

The verification:

- confirms the supplied identities are an active owner and an active non-owner;
- rejects unauthenticated generation and download attempts;
- rejects owner generation before recorded identity verification;
- allows the owner exactly one download after verification;
- rejects non-owner generation and download attempts;
- rejects expired and already-claimed packages;
- checks audit metadata for package references and summary fields only, never
  the package payload, requester data, payment references, or credentials;
- creates unique synthetic requests only and removes their requests, packages,
  and audit records even if an assertion fails.

The live development run completed on 2026-08-24 with fresh authenticated owner
and operations identities. All assertions above passed; the temporary staff and
privacy-test records were removed after the run.