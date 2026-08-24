# SOSO live atelier-day role checklist

## Purpose and safety boundary

This checklist verifies what each **assigned** SOSO staff role can do in the protected staff portal before a live atelier day. It is not a staff roster, shift assignment, payment activation, or legal/policy approval. Those remain external approval gates.

The portal is only available after Clerk authentication and an active database-backed SOSO role assignment. Route authorization is enforced server-side; hiding a panel in the browser is not the access control.

## Permission matrix

| Role | Can do during an atelier day | Must not do |
| --- | --- | --- |
| Owner | View and manage order workflow, enquiries, privacy procedures, content, redirects, aggregate reporting, operational exports, and internal refund decisions. Generate a verified subject-access package. | Treat a browser return as payment proof, store card data, or activate JusticeSure without the separately approved launch gate. |
| Operations / atelier | Move an existing paid order through `atelier confirmation → in production → ready → fulfilled`; manage enquiries; log and verify privacy requests; manage redirects. | Approve internal refund decisions, generate/download privacy packages, access aggregate analytics/audit exports, or claim a payment succeeded. |
| Stylist / support | Handle customer enquiries and look up active order status read-only to answer fit, styling, and order-status questions. | Change order workflow, process privacy requests, approve refunds, access exports/audit reports, or make payment claims. |
| Analyst | View consented aggregate analytics, quality/freshness context, audit visibility, and safe aggregate exports. | View customer/order records, edit operations, process privacy requests, publish content, or make payment/revenue claims from intent events. |
| Editor | Create, revise, preview, publish, archive, and manage FAQ/Journal content within the CMS safeguards. | Access customer/order/privacy records, operational reports, redirects, or payment controls. |

## Before opening the atelier queue

1. SOSO names the on-duty owner, operations lead, stylist/support contact, and escalation decision-maker for the shift.
2. The owner confirms that each person has the exact active role above—no shared accounts and no role guessing.
3. The operations lead confirms which approved system is the source of truth for paid orders. Until JusticeSure is live and verified, the portal must not be used to infer payment success.
4. The team confirms the approved customer-support channel and the escalation path for payment, delivery, custom-fit, cancellation/refund, privacy, and security questions.
5. The owner reviews new operational notifications and any unprocessed privacy requests. Deletion requests stay blocked until SOSO approves retention and legal rules.

## During the shift

- Operations records progress only against confirmed orders and uses internal atelier/delivery notes for handoff context.
- Stylists answer customers from approved order states; they escalate any requested order change to operations.
- Analysts use aggregate, consented signals only. `payment_clicked` is not payment success, revenue, or a paid conversion.
- Editors keep unapproved factual/legal content in draft. Publication does not imply production SEO release.
- Owners approve sensitive decisions and may generate a subject-access package only after retained identity-verification evidence; downloads are one-time and short-lived.

## End-of-day handoff

1. Operations reviews orders still awaiting the next state and records only approved internal notes.
2. The owner reviews refund decisions, sensitive privacy actions, and operational notifications.
3. The team records unresolved customer cases in the approved support workflow, not in ad hoc messaging.
4. Any payment, provider, fulfilment, or security anomaly is handled under the production launch runbook's incident procedure.

## Still required before live commerce

- An approved staff roster, role assignments, backup cover, and named shift escalation contacts.
- JusticeSure merchant runtime, hosted payment/session contract, webhook/refund handling, catalogue, and fulfilment acceptance.
- Approved support channels, final legal/policy text, retention/deletion rules, and live operational sign-off.
