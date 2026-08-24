# JusticeSure (Kontrol) — Full Build Inventory & Differentiation Evidence

**Purpose:** This document is the verified, code-audited source of truth for what JusticeSure can do **today**, written to feed the investor pitch-deck work. Every claim below was checked against the live codebase (August 2026). It also reviews, line by line, the capability matrix and Control-Intelligence thesis from the ChatGPT competitive analysis, marking each claim **VERIFIED TODAY**, **PARTIAL**, or **GAP (roadmap)** — so the deck never makes an unsupported claim.

**Headline finding:** ChatGPT's matrix *understated* the product. It marked Payroll as "—/roadmap?", and Production, Projects, Offline, and Audit trails as "?" — all of these are fully built. More importantly, several capabilities ChatGPT framed as the *future* Control-Intelligence moat ("Opportunity") already exist in production today: quantified inventory-leakage detection with owner alerts, per-cashier cash variance, bank-statement reconciliation with sign-off locks, and AI-monitored approval interventions.

---

## Part 1 — What JusticeSure is, in one paragraph

JusticeSure is a Nigeria-native business operating system for SMEs and multi-branch corporations: POS + inventory + invoicing + customers/debtors + full double-entry accounting + bank reconciliation + expenses + procurement + production + projects/time billing + HR (attendance, payroll, performance) + Nigerian tax & compliance (NRS e-invoicing, PAYE, VAT, CAC) + an organization portal for NGOs/cooperatives — with a customer-facing online storefront, offline-capable POS, role-based permissions with audit trails on every money movement, and an emerging control layer that detects and quantifies leakage (unexplained stock, cash variance, unreconciled bank money) and alerts the owner in naira terms.

---

## Part 2 — Verified module inventory (what exists TODAY)

### 2.1 Sales & POS
- Full till/POS: barcode + grid, cart, multi-payment (cash/card/transfer/split), receipts (thermal + A4), change calculation, tips, delivery fees.
- **Offline-first POS**: service-worker cached catalogue/customers; sales queued offline and replayed on reconnect with server-side attribution hardening; unresolved-offline-sale detection alerts.
- Credit sales ("Pay Later") with manager-PIN approval flow; parked-order approval banners.
- **Escalation controls at the till**: voids and price overrides require permission holders or a live approval escalation (triple-bound to the approving session) — a genuine anti-fraud intervention, not a log entry.
- Anti-tamper price re-derivation server-side (client cannot submit manipulated prices).
- POS shifts: open/close with declared cash counts, **expected-vs-counted variance computed per cashier per shift**, consolidated drawer-variance reporting.
- Public/branded POS + storefront links (link_slug), WhatsApp order sharing, loyalty points (earn/redeem with idempotency), coupons, agent commissions with void-cancellation.

### 2.2 Inventory (multi-location)
- Products + variants, categories, SKU management, CSV import/export (with SKU caps by plan), raw-material flagging (excluded from all selling surfaces).
- **True multi-branch stock**: per-location quantities, global = Σ branches invariant, inter-location transfers with location-confined staff rules, intercompany transfers between subsidiaries.
- Stock history as a derived ledger per branch and globally (every movement classified and walkable).
- **Stock Flow shrinkage detection (owner-facing)**: every stock movement classified; unexplained removals flagged with quantities and naira value; owner reviews/acknowledges with an audit trail; **scheduled daily alerts when open unexplained-out value exceeds a configurable threshold (default ₦10,000)**.
- **Stock drift detection & repair (owner-facing)**: global-vs-branch mismatch surfaced with one-click corrective actions.
- Stock insights: sales velocity, days-to-runout, reorder urgency, PO pre-fill.
- FX-linked pricing (cost in USD/CNY/GBP, auto-repriced selling prices).

### 2.3 Invoicing & documents
- Invoices, quotes, proformas, credit notes, delivery notes, receipts; quote→invoice conversion carrying totals verbatim; recurring invoice schedules with a shared generator.
- Per-branch stock locking at invoice issue (no overselling a branch).
- E-signature: place signature boxes on PDFs, OTP + typed-name signing, byte-identical stamped PDFs, contract lifecycle events.
- Branded documents: entity-derived branding (each subsidiary's own logo/name), A4 print contract with multipage flow, thermal formats, WhatsApp delivery (API-metered or manual outbox), unified document numbering.

### 2.4 Customers, debtors & money owed
- CRM: customer profiles, interaction notes, statements, store credit, advances.
- **Canonical customer ledger (integer-kobo, append-only)** — the single source of truth for who owes what; receivable vs wallet strictly separated.
- Debtors dashboards with branch/entity scoping, overdue tracking, credit-note handling, write-off + recovery flows (auto-reversal on later payment), settlement recording tied to receipts.
- This directly powers claims like *"these 17 customers owe you ₦6.2m, of which ₦3.1m is overdue"* — that exact query is answerable today.

### 2.5 Accounting & bank reconciliation
- Full double-entry: chart of accounts, journal posting from operational events, financial statements (P&L, balance sheet) with PDF export.
- **Bank statement import**: multi-bank parser (header detection, credit/debit column handling), mapping UI.
- **Reconciliation inbox**: bank lines matched against recorded sales/invoices/expenses; manual match, retry, ignore; **Review & Post** unmatched lines to the ledger with real CoA codes; matched lines protected from double-posting.
- **Monthly sign-off locks**: daily and monthly branch sign-offs; signed-off periods are locked against edits (enforced in the service layer, not just UI).
- Payroll→ledger and bank-line→ledger posting services with reversal support.
- Revenue convergence: every "today's revenue" surface (dashboard, cashier day totals, sales report, online-store analytics) reads from one canonical computation.

### 2.6 Expenses & procurement
- Expense capture with receipts/documentation attachments, draft privacy, category management, multi-currency with NGN equivalents, exports (CSV/PDF/Excel).
- Purchase orders, supplier management, PO receive with auto-create of inventory, B2B fulfilment.
- **P2P approval authority**: procurement approve/reject requires owner/manager authority; self-approval blocked (separation of duties enforced in code).
- QuickBooks OAuth integration (connect, sync, disconnect).

### 2.7 HR (full suite)
- Employee directory with seat-based licensing (login-capable identities only), CSV bulk import with atomic seat checks.
- **Attendance**: self check-in, geofencing, **biometric punch devices** (live SSE stream, selfie capture, queued punches), schedules.
- **Payroll (fully built — ChatGPT's matrix wrongly marked this "roadmap")**: NTA-2025 PAYE brackets, pension (employee+employer), NHF, NHIS, NSITF, ITF, TETFUND; payroll groups, salary components/templates; run→approve→payslips workflow; payslip PDFs emailed and pushed to the employee portal; NIBSS bank-upload CSV export; PAYE/pension/NSITF remittance schedules and YTD registers; **auto or manual posting to the accounting ledger with unpost/reversal**; cooperative deductions end-to-end (org-locked so a foreign employee can never be linked).
- **Performance management**: goals with confidential check-ins, review cycles, PIPs, private feedback visibility rules, reminders.
- Employee self-service portal (payslips, attendance) via tokenized access.
- HR contracts with e-signature.

### 2.8 Nigerian tax & compliance (a genuine depth advantage)
- **NRS e-invoicing**: IRN + QR on POS receipts against the NRS sandbox (go-live artifact exists); FIRS→NRS transition tracked.
- Filing-automation engine with verticals: PAYE, VAT, WHT, CIT, CAC annual return, e-invoicing, pension, NSITF, ITF, stamp duty — builder services + guarded portal drivers with honest OTP handoff (the human stays in control of submission).
- CAC: registry snapshot/sync, RC lookup, annual-return preview + portal-ready CSV.
- TCC (tax clearance certificate) record-keeping and tenant tax-payment recording.
- Regulatory alerts (authority + headline feeds, e.g. FIRS rate changes).
- Tax exposure estimation from recorded transactions — the *"estimated tax exposure"* line in the pitch is answerable today.

### 2.9 Production / manufacturing
- BOM templates tied to inventory raw materials; production orders and jobs with measurement snapshots.
- Customizable stage workflows (default: Created→Cutting→Sewing→Finishing→QC→Ready→Completed; 2–20 custom stages, forward-only, redo stages, append-only stage audit log, customer stage notifications).
- Job costing: actual material consumption with unit-cost snapshots; multiplier or fixed pricing; **minimum-multiplier price floor enforced at invoice conversion** (a margin-protection control).
- Production invoicing with per-job COGS for margin reporting; atomic double-billing prevention.

### 2.10 Projects & time billing
- Projects with budgets (hours + amount), default rates, status lifecycle.
- Time entries: manual + timer (quarter-hour rounding), billable/billed flags, staff attribution, **branch confinement policy on every read/write**.
- Unbilled-time tracking with monetary value; conversion to invoices; CSV export.

### 2.11 Organization portal (NGOs, cooperatives, associations)
- Separate portal for member organizations: members, dues, budgets, assets, audits, accounting.
- Multi-currency donations/grants with FX rollup to NGN.
- Governance document signing via the same e-signature service.

### 2.12 Platform & trust infrastructure
- **RBAC**: fine-grained permission registry (enforced server-side route by route), role templates, sidebar/tab/page gating in 4 layers, separation-of-duties on approvals, owner-only gates distinct from staff rows.
- **Audit trails**: price override log (location-aware), stage histories, payroll approvals, pixel-config changes, contract events, stock-flow review history — append-only patterns throughout.
- Multi-entity: parent org + subsidiaries, per-entity branding/documents/scoping, branch (location) scoping on every financial write going forward.
- **Pre-publish integrity gates** (internal, but a real trust asset): ledger-write-failure gate, stock-drift gate, scheduled production integrity scans, RBAC enforcement suites — thousands of automated tests must pass before any release.
- PWA: installable, offline shell, update flow.
- Payments: Paystack (checkout, webhooks, tab-close recovery), payment links, storefront card payments.
- AI: business assistant (metered AI credits), image enhance/background removal for product photos, AI-guarded spend caps per plan.
- Consent-gated marketing pixel layer (Meta/Google/TikTok/LinkedIn/X) with real opt-out; SEO/structured data/OG cards on the marketing site.
- Security posture: SSRF guards, portal-token guards, tenant isolation enforced + tested across every read/write fan-out.

---

## Part 3 — Line-by-line review of ChatGPT's capability matrix

Corrections to the "JusticeSure*" column (legend: ● strong, ◐ partial, ○ weak):

| Capability | ChatGPT said | **Verified reality** | Evidence class |
|---|---|---|---|
| Sales/invoicing | ● | **● confirmed** | Full POS + invoice suite (2.1, 2.3) |
| Inventory | ● | **● confirmed** | 2.2 |
| Multi-location inventory | ● | **● confirmed** | Per-branch ledgers, transfers, drift detection (2.2) |
| Expenses | ● | **● confirmed** | 2.6 |
| Full accounting | ● | **● confirmed** | Double-entry + statements + posting services (2.5) |
| Bank reconciliation | ● | **● confirmed** | Import→match→Review & Post→sign-off locks (2.5) |
| CRM | ● | **● confirmed** | 2.4 |
| HR/performance | ● | **● confirmed** | 2.7 |
| **Payroll** | —/roadmap? | **● — FULLY BUILT.** Correct the matrix. | NTA-2025 engine, statutory deductions, payslips, NIBSS export, ledger posting (2.7) |
| Nigerian tax/compliance | ● | **● confirmed — deeper than claimed** | NRS e-invoicing + 10 filing verticals + CAC (2.8) |
| FIRS-oriented workflows | ● | **● confirmed** (now NRS) | 2.8 |
| Procurement | ● | **● confirmed** | POs, suppliers, SoD approvals (2.6) |
| **Production/manufacturing** | ? | **● — FULLY BUILT.** | BOM, stages, job costing, price floors (2.9) |
| **Projects** | ? | **● — FULLY BUILT.** | Projects + time billing + unbilled tracking (2.10) |
| Multi-currency | ● | **● confirmed** | FX pricing, per-currency expenses, org FX rollups |
| **Offline capability** | ? | **● — FULLY BUILT.** | Offline POS queue + PWA + offline-sale alerts (2.1, 2.12) |
| API/integrations | ● | **◐ — downgrade slightly.** Paystack live; QuickBooks/WhatsApp API/Google Calendar coded but credential-gated; developer API surface exists but is not a mature public API program. | 2.12 |
| Roles/permissions | ● | **● confirmed — registry-enforced, tested** | 2.12 |
| **Audit trails** | ● (competitors ?) | **● confirmed — pervasive** | 2.12 |
| AI business assistant | ● | **● confirmed (metered)** | 2.12 |
| AI business insights | ● | **◐ — be careful.** Stock insights + AI assistant exist; a proactive cross-module insight feed does not yet. | 2.2 |
| Automated bank matching | ● | **● confirmed** | 2.5 |
| Legal/compliance services | ● | **● confirmed — this is real whitespace** (filing verticals + CAC + e-signature + regulatory alerts; competitors have none of this depth) | 2.8 |
| Human professional support | ● | **◐ — verify commercially, not in code.** The software supports accountant-sharing and OTP-handoff filing, but "human professional support" is an operations claim. Only claim what the service team actually delivers. | 2.7, 2.8 |

### The "Opportunity" rows — this is the important correction

ChatGPT marked all five Control-Intelligence rows as pure "Opportunity" (i.e., not built). **Three of them are partially built today:**

| Capability | ChatGPT said | **Verified reality** |
|---|---|---|
| **Operational leakage detection** | Opportunity | **◐ EXISTS for inventory + cash.** Stock Flow flags unexplained removals with naira value and alerts the owner daily above a threshold. POS shift variance quantifies cash gaps per cashier. Bank recon inbox surfaces unmatched money. What's missing: expenses-vs-documentation and procurement price-variance checks. |
| **Cross-module anomaly detection** | Opportunity | **○→◐ PARTIAL.** Each module detects within itself; there is no engine yet that joins stock→sales→bank→ledger into one finding. (Internally, ledger-vs-invoice parity checks already run as release gates — the raw material exists.) |
| **Quantified potential loss** | Opportunity | **◐ EXISTS in pockets.** Unexplained stock is already valued in naira ("N units, ₦X at risk"); cash variance is naira-quantified; overdue receivables are naira-quantified. No unified "Money Protected / total leakage" rollup yet. |
| **Automated control intervention** | Opportunity | **◐ EXISTS in pockets.** Price-override/void escalations hold the transaction until an authorized approver acts; procurement blocks self-approval; seat/SKU caps block at write time; sign-off locks freeze closed periods. What's missing: AI-driven anomaly-triggered holds (e.g., auto-flagging an unusual ₦4.2m stock adjustment). |
| **Business Control Score** | Opportunity | **GAP — does not exist.** All six proposed sub-pillars (cash, inventory, expense, receivables, compliance, operational controls) have live data feeds today, so this is an aggregation + scoring layer, not a data-collection project. |

**Deck-safe phrasing this supports:** *"Today: an integrated Business OS that already detects and quantifies inventory leakage, cash variance, and unreconciled money — and physically holds risky transactions for approval. Next: unify these detectors into a cross-module Control Graph, a Money-Protected counter, and the JusticeSure Control Score."* Every word of that is verifiable.

---

## Part 4 — Honest gap list (what does NOT exist yet)

These are the items from the ChatGPT thesis that are genuinely not built. Each is feasible on the current data model — noted with rough effort.

| # | Gap | What it would take | Effort |
|---|---|---|---|
| G1 | **Control Graph / cross-module reconciliation engine** — "₦12.4m of stock left, only ₦10.8m of sales recorded"; invoices→expected receipts→bank matched, classified into outstanding / needs matching / investigate | The joins exist (stock history, orders, ledger, bank lines). Needs a service that walks the chain per period and emits findings. | Large (the flagship build) |
| G2 | **Money Protected counter** — "JusticeSure protected ₦18.7m this year" | Aggregate resolved Stock-Flow reviews, recovered variances, matched bank lines, collected overdues into one metric with history | Medium — mostly aggregation over existing events |
| G3 | **JusticeSure Control Score™** (82/100 with six sub-scores) | Scoring formula over existing signals + a dashboard card + trend | Medium |
| G4 | **Expense-vs-documentation check** — "₦350k of expenses have no supporting documentation" | Expenses already store attachments; needs a completeness sweep + owner surface | Small |
| G5 | **Procurement price-variance check** — "submitted ₦480k vs PO ₦390k vs historical ₦380–400k" | PO, invoice, and price history all exist; needs the comparison rule + alert | Small–Medium |
| G6 | **AI Control Agent** — anomaly-triggered holds with evidence requests and escalation | The approval/hold plumbing exists (escalation covers, proposals); needs anomaly triggers wired into it + an escalation timer | Medium–Large |
| G7 | **Cross-business benchmarking** — "your shrinkage is 4.7% vs industry X%" | Requires anonymized cross-tenant aggregation; a data-scale play, honest to pitch as the long-term flywheel, not near-term | Long-term |
| G8 | **Proactive AI insight feed** (beyond ask-a-question) | Scheduled analysis jobs writing to a notification feed | Medium |
| G9 | Branch-vs-company anomaly ratios ("Branch 3 adjustments are 4.2× company average") | Stock-Flow data already per-branch; needs the comparative statistic + surface | Small |
| G10 | Public developer API as a product (keys, docs, rate limits) | Surface exists; needs productization | Medium |

**Recommended build order for the "three killer controls"** (matches ChatGPT's advice, ordered by distance-to-done):
1. **Inventory leakage** — 70% built (Stock Flow + drift + alerts). Add G9 + fold into G2/G3.
2. **Bank/payment reconciliation intelligence** — matching inbox is built. Add the G1 revenue-chain classification (outstanding vs unmatched vs investigate).
3. **Expense/procurement leakage** — G4 + G5, the smallest lift, high demo value.

---

## Part 5 — Differentiation claims that ARE deck-safe today

1. **The only Nigeria-native platform that spans operations→money→compliance AND already intervenes**: holds risky POS actions for approval, blocks self-approved procurement, locks signed-off periods, and alerts owners to quantified stock leakage daily. Competitors record; JusticeSure already interrupts.
2. **Regulatory depth no local competitor matches**: NRS e-invoicing (IRN+QR at the till), 10 statutory filing verticals with honest OTP handoff, CAC integration, NTA-2025 payroll engine — compliance is a *workflow*, not a checkbox.
3. **A ledger-first money architecture**: every kobo flows through one append-only customer ledger reconciled against invoices, orders, and bank lines — the exact data foundation the Control-Intelligence layer needs (this is the credible answer to "why won't Odoo just build this?" — retrofit vs designed-in).
4. **Multi-branch control designed for Nigerian operating reality**: per-branch stock/pricing/sign-offs, location-confined staff, offline-first tills, cash-heavy workflows, WhatsApp-native documents.
5. **Trust engineering as a moat**: thousands of automated integrity tests, production drift scans, and release gates that block publishing when a single ledger write failed. (Investors diligencing the codebase will find this; competitors' velocity claims rarely survive it.)
6. **Software + professional-execution ready**: accountant sharing, filing handoffs, e-signature, employee portals — the rails for a services layer are built into the product.

**Claims to avoid or caveat** (would not survive diligence as stated):
- "AI anomaly detection across the whole business" — say *"leakage detection live for inventory and cash; cross-module engine in build."*
- "Full integrations ecosystem" — Paystack is live; QuickBooks/WhatsApp API/Google are coded but credential-gated.
- "Business Control Score" — vision slide only, clearly labelled.
- Do not present illustrative leakage numbers as customer data unless labelled illustrative.

---

## Part 6 — Suggested "Today / Next / Vision" slide content (all verifiable)

- **Today:** Integrated Business OS (POS, inventory, invoicing, accounting, bank reconciliation, HR/payroll, tax/compliance, production, projects) + live controls: quantified inventory-leakage alerts, cash-variance tracking, approval interventions, period locks, pervasive audit trails.
- **Next (the raise):** Control Graph joining stock→sales→payments→bank→ledger→tax; Money Protected counter; Control Score; expense/procurement leakage checks; AI Control Agent on the existing approval rails.
- **Vision:** The control infrastructure that helps African businesses account for every naira — with cross-business benchmarking as the data flywheel.
