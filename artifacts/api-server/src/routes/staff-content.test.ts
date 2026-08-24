import assert from "node:assert/strict";
import test from "node:test";
import { requireStaffRoles } from "../middlewares/staff";
import {
  buildFaqCreateAuditMetadata,
  buildFaqDeleteAuditMetadata,
  buildFaqUpdateAuditMetadata,
  sortFaqHistoryNewestFirst,
  default as staffContentRouter,
} from "./staff-content";

const actor = "clerk_staff_editor";
const draft = {
  id: "faq-001",
  question: "How long does delivery take?",
  answer: "Delivery takes five business days.",
  category: "Delivery",
  sortOrder: 2,
  isPublished: false,
  createdAt: new Date("2026-08-24T10:00:00.000Z"),
  updatedAt: new Date("2026-08-24T10:00:00.000Z"),
};
const published = {
  ...draft,
  answer: "Delivery takes three to five business days.",
  isPublished: true,
  updatedAt: new Date("2026-08-24T10:02:00.000Z"),
};

test("FAQ create audit metadata captures the complete draft snapshot and transition", () => {
  assert.deepEqual(buildFaqCreateAuditMetadata(draft), {
    snapshot: {
      question: draft.question,
      answer: draft.answer,
      category: draft.category,
      sortOrder: draft.sortOrder,
      isPublished: false,
    },
    transition: { from: null, to: "draft" },
  });
  assert.equal(actor, "clerk_staff_editor");
});

test("FAQ update audit metadata captures previous and current snapshots, including publish transition", () => {
  assert.deepEqual(buildFaqUpdateAuditMetadata(draft, published), {
    previousSnapshot: {
      question: draft.question,
      answer: draft.answer,
      category: draft.category,
      sortOrder: draft.sortOrder,
      isPublished: false,
    },
    snapshot: {
      question: published.question,
      answer: published.answer,
      category: published.category,
      sortOrder: published.sortOrder,
      isPublished: true,
    },
    transition: { from: "draft", to: "published" },
  });
  assert.deepEqual(buildFaqUpdateAuditMetadata(published, draft).transition, {
    from: "published",
    to: "draft",
  });
});

test("FAQ delete audit metadata preserves the last snapshot and records deletion", () => {
  assert.deepEqual(buildFaqDeleteAuditMetadata(published), {
    previousSnapshot: {
      question: published.question,
      answer: published.answer,
      category: published.category,
      sortOrder: published.sortOrder,
      isPublished: true,
    },
    transition: { from: "published", to: "deleted" },
  });
});

test("FAQ history is newest first and retains actor and timestamp fields", () => {
  const oldest = {
    id: "audit-created",
    actorClerkUserId: actor,
    action: "faq.created",
    metadata: buildFaqCreateAuditMetadata(draft),
    createdAt: new Date("2026-08-24T10:00:00.000Z"),
  };
  const newest = {
    id: "audit-deleted",
    actorClerkUserId: "clerk_staff_owner",
    action: "faq.deleted",
    metadata: buildFaqDeleteAuditMetadata(published),
    createdAt: new Date("2026-08-24T10:04:00.000Z"),
  };
  const history = sortFaqHistoryNewestFirst([oldest, newest]);

  assert.deepEqual(history.map((event) => event.id), ["audit-deleted", "audit-created"]);
  assert.equal(history[0]?.actorClerkUserId, "clerk_staff_owner");
  assert.ok(history[0]?.createdAt instanceof Date);
  assert.equal(history[0]?.createdAt.toISOString(), "2026-08-24T10:04:00.000Z");
});

test("FAQ history is registered as read-only and limited to owner/editor staff", () => {
  const routerStack = (staffContentRouter as unknown as {
    stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }>;
  }).stack;
  const historyRoute = routerStack
    .map((layer) => layer.route)
    .find((route) => route?.path === "/staff/faq/:id/history");

  assert.ok(historyRoute);
  assert.deepEqual(Object.keys(historyRoute.methods), ["get"]);

  const denied = requireStaffRoles("operations");
  let status: number | undefined;
  let continued = false;
  denied(
    { staff: { role: "editor" }, log: { warn() {} } } as never,
    {
      status(code: number) {
        status = code;
        return { json() {} };
      },
    } as never,
    () => { continued = true; },
  );
  assert.equal(status, 403);
  assert.equal(continued, false);
});