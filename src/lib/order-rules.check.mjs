// node src/lib/order-rules.check.mjs
import assert from "node:assert/strict";
import { CHECKOUT_EVENTS, nextFulfilment, nextStatus, refundLabel, sessionEvent } from "./order-rules.ts";

const C = "checkout.session.completed";
const OK = "checkout.session.async_payment_succeeded";
const FAIL = "checkout.session.async_payment_failed";
const EXP = "checkout.session.expired";

// Forward transitions.
assert.equal(nextStatus("pending", C, "paid"), "paid", "card payment completes");
assert.equal(nextStatus("pending", C, "no_payment_required"), "paid");
assert.equal(nextStatus("pending", C, "unpaid"), "processing", "delayed method: completed but not yet paid");
assert.equal(nextStatus("processing", OK, "paid"), "paid");
assert.equal(nextStatus("processing", FAIL, "unpaid"), "payment_failed");
assert.equal(nextStatus("pending", EXP, "unpaid"), "expired", "abandoned checkout");
// Async result arriving before `completed` (out of order) still lands correctly.
assert.equal(nextStatus("pending", OK, "paid"), "paid");
assert.equal(nextStatus("pending", FAIL, "unpaid"), "payment_failed");

// Terminal states never move: every repeat or late event is a no-op.
for (const s of ["paid", "payment_failed", "expired"])
  for (const e of CHECKOUT_EVENTS)
    for (const p of ["paid", "unpaid"]) assert.equal(nextStatus(s, e, p), null, `${s} + ${e}/${p} must not change`);

// A duplicate `completed` or a late `expired` never rewinds a processing order.
assert.equal(nextStatus("processing", C, "unpaid"), null);
assert.equal(nextStatus("processing", EXP, "unpaid"), null);

// Only Stripe's own "paid" counts as paid.
assert.equal(nextStatus("pending", C, "something_new"), null, "unknown payment_status is never paid");
assert.equal(nextStatus("processing", OK, "unpaid"), null, "succeeded event without paid status changes nothing");

// A session fetched from Stripe (success-page fallback) maps to the same transitions as its webhook.
const via = (order, s, p) => { const e = sessionEvent(s, p); return e && nextStatus(order, e, p); };
assert.equal(via("pending", "complete", "paid"), "paid", "webhook missing: paid session confirms the order");
assert.equal(via("processing", "complete", "paid"), "paid", "delayed payment cleared");
assert.equal(via("pending", "complete", "unpaid"), "processing");
assert.equal(via("processing", "complete", "unpaid"), null, "still clearing: no change");
assert.equal(via("pending", "expired", "unpaid"), "expired");
assert.equal(via("pending", "open", "unpaid"), null, "customer hasn't paid: nothing inferred");
assert.equal(via("pending", "complete", "something_new"), null, "unknown payment_status is never paid");
for (const s of ["paid", "payment_failed", "expired"]) assert.equal(via(s, "complete", "paid"), null, `${s} never moves`);

// Fulfilment: admin-driven, paid orders only, forward only.
const T = { carrier: "UPS", trackingNumber: "1Z999" };
assert.equal(nextFulfilment("paid", "unfulfilled", "ship", T), "shipped");
assert.equal(nextFulfilment("paid", "unfulfilled", "ship"), null, "shipping needs tracking");
assert.equal(nextFulfilment("paid", "unfulfilled", "ship", { carrier: "UPS", trackingNumber: "  " }), null, "blank tracking number");
assert.equal(nextFulfilment("paid", "unfulfilled", "ship", { carrier: "", trackingNumber: "1Z999" }), null, "blank carrier");
assert.equal(nextFulfilment("paid", "shipped", "deliver"), "delivered");
assert.equal(nextFulfilment("paid", "unfulfilled", "cancel"), "cancelled");
assert.equal(nextFulfilment("paid", "shipped", "cancel"), null, "no cancel after shipping");
assert.equal(nextFulfilment("paid", "unfulfilled", "deliver"), null, "deliver needs shipped first");
assert.equal(nextFulfilment("paid", "shipped", "ship", T), null, "no re-ship");
for (const f of ["delivered", "cancelled"])
  for (const a of ["ship", "deliver", "cancel"]) assert.equal(nextFulfilment("paid", f, a, T), null, `${f} is final`);
for (const s of ["pending", "processing", "payment_failed", "expired"])
  for (const a of ["ship", "deliver", "cancel"]) assert.equal(nextFulfilment(s, "unfulfilled", a, T), null, `${s} can't be fulfilled`);

// Refunds: derived from Stripe's cumulative amount_refunded, never a status.
const fmt = (c) => `$${(c / 100).toFixed(2)}`;
assert.equal(refundLabel(0, 5000, fmt), null, "nothing refunded");
assert.equal(refundLabel(1250, 5000, fmt), "Partially refunded ($12.50)");
assert.equal(refundLabel(5000, 5000, fmt), "Refunded", "full refund");
assert.equal(refundLabel(6000, 5000, fmt), "Refunded", "over the stored total still reads as refunded");

console.log("order rules ok");
