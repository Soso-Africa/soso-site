# Subscriber groups and Excel export

Owners and administrators manage subscribers from **Staff → Email & newsletter**.
No group action changes a subscriber's consent status.

## Subscribers

- **Export Excel** downloads a real `.xlsx` file containing every subscriber
  matching the current status and group filters, across all pages.
- Export columns include email, status, group names, consent policy and UTC
  consent/confirmation/unsubscribe timestamps. Spreadsheet values are literal
  strings, not formulas.
- Synchronous exports above 50,000 matching subscribers are rejected explicitly;
  narrow the status or group filter rather than accepting a truncated download.
- Create and rename groups in Subscribers. Select contacts on the current page,
  choose a target group, and add or remove them. A subscriber can belong to
  multiple groups. Changing filters or pages clears the current selection.
- Deleting an unused group removes only memberships, never subscribers.
  A group referenced by a campaign cannot be deleted.

## Campaigns

- Choose **All confirmed subscribers** or one group when creating a draft.
  An unsent campaign's audience can also be changed before its first send attempt.
- After the first durable send attempt, the campaign's audience is locked.
  Create another campaign to target a different audience.
- Groups are dynamic: additions and removals affect future batches, but cannot
  retract an email already reserved or accepted by SMTP.
- Remaining counts only currently confirmed matching subscribers without a
  previous send reservation. Membership, consent, audience identity and the
  existing hourly allowance are checked again before a send is reserved.
- Sending remains an explicit batch of up to three. This feature does not add
  automatic mass mailing, bypass double opt-in, or raise the hosting allowance.

## Release and verification

The additive migration is `lib/db/migrations/0017_newsletter_groups.sql`.
It preserves existing campaigns as the all-confirmed audience and does not
alter stored mailbox credentials. Release it through the existing protected
deployment process; a working Replit preview alone is not a production release.

```sh
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/soso-store run typecheck
node lib/db/scripts/run-in-isolated-soso-schema.mjs pnpm --dir scripts exec tsx --test ../artifacts/api-server/src/routes/newsletter-groups.test.ts
pnpm run test:migrations
```

The integration suite refuses non-disposable schemas, exports 55 synthetic
contacts to prove pagination coverage, reads the XLSX back, and verifies group
CRUD, audience changes, consent and quota enforcement without contacting SMTP.
