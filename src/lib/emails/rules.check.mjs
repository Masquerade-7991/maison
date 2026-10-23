// Run: node src/lib/emails/rules.check.mjs  (Node 23+ strips the TS types)
import assert from "node:assert/strict";
import { emailImage, esc, renderEmail } from "./layout.ts";
import { addressOf, isSuppressed, isTransient, orderSubject, orderThreadHeaders, trackingUrl } from "./rules.ts";

// Threading: the confirmation is the root; later emails reply to it with their own unique id.
const root = orderThreadHeaders("abc", "confirmed", "shop.test");
assert.deepEqual(root, { "Message-ID": "<order.abc.confirmed@shop.test>" });
const shipped = orderThreadHeaders("abc", "shipped", "shop.test", false, "1");
assert.equal(shipped["In-Reply-To"], root["Message-ID"]);
assert.equal(shipped.References, root["Message-ID"]);
assert.notEqual(shipped["Message-ID"], orderThreadHeaders("abc", "shipped", "shop.test", false, "2")["Message-ID"], "each email has its own id");
const again = orderThreadHeaders("abc", "confirmed", "shop.test", true, "3");
assert.notEqual(again["Message-ID"], root["Message-ID"], "a resent confirmation gets its own id");
assert.equal(again["In-Reply-To"], root["Message-ID"], "and replies to the original");
assert.equal(orderSubject("MSN-1A2B"), "Your Maison order MSN-1A2B", "one subject per order thread");

// Tracking links for known carriers only.
assert.equal(trackingUrl("UPS Ground", "1Z 999"), "https://www.ups.com/track?tracknum=1Z%20999");
assert.match(trackingUrl("FedEx", "123"), /fedex\.com.*123$/);
assert.match(trackingUrl("India Post", "EE123IN"), /indiapost/);
assert.equal(trackingUrl("Local courier", "1"), null);
assert.equal(trackingUrl("DHL", null), null);

// Test and example addresses never get real mail.
assert.ok(isSuppressed("qa.checkout+1@example.com"));
assert.ok(isSuppressed("x@mail.example.org"));
assert.ok(!isSuppressed("someone@gmail.com"));
assert.ok(!isSuppressed("me@notexample.com"));
assert.equal(addressOf("Maison <maison.shop@gmail.com>"), "maison.shop@gmail.com");
assert.equal(addressOf("plain@x.com"), "plain@x.com");

// Retry only temporary failures.
assert.ok(isTransient({ responseCode: 421, message: "4.4.5 Server busy, try again later" }), "Gmail busy");
assert.ok(isTransient({ code: "EPROTOCOL", message: "Invalid greeting. response=421-4.4.5 Server busy" }), "busy at greeting");
assert.ok(isTransient({ code: "ETIMEDOUT" }), "timeout");
assert.ok(!isTransient({ code: "EAUTH", responseCode: 535, message: "Username and Password not accepted" }), "wrong password is final");
assert.ok(!isTransient({ responseCode: 550, message: "No such user" }), "refused address is final");

// Rendering: escaped, both parts, preheader hidden, images as JPEG.
assert.equal(esc(`<b>"Tom's" & co</b>`), "&lt;b&gt;&quot;Tom&#39;s&quot; &amp; co&lt;/b&gt;");
const e = renderEmail({
  subject: "S",
  preheader: "Preview",
  site: "https://shop.test",
  blocks: [
    { t: "label", text: "Order confirmed" },
    { t: "title", text: "Thank you, <Ana>" },
    { t: "button", text: "View order", href: "https://shop.test/o?a=1&b=2" },
    { t: "rows", rows: [["Subtotal", "₹10,000"]], total: ["Total", "₹10,000"] },
  ],
});
assert.ok(e.html.includes("Thank you, &lt;Ana&gt;") && !e.html.includes("<Ana>"), "content is escaped");
assert.ok(e.html.includes("https://shop.test/o?a=1&amp;b=2"), "links are escaped");
assert.ok(e.html.includes('content="light only"'), "light colour scheme declared");
assert.match(e.text, /ORDER CONFIRMED[\s\S]*Thank you, <Ana>[\s\S]*View order: https:\/\/shop\.test\/o\?a=1&b=2[\s\S]*Total: ₹10,000/);
assert.match(emailImage("https://images.unsplash.com/photo-1?ar=4:5&fit=crop&w=1600&auto=format", 72), /w=144.*fm=jpg/);
assert.ok(!emailImage("https://images.unsplash.com/photo-1?auto=format", 72).includes("auto="));


// Every style attribute survives intact (a double quote inside one would cut it short).
for (const m of e.html.matchAll(/style="([^"]*)"/g)) assert.ok(!m[1].includes("&quot;"), "no quotes inside style");
assert.match(e.html, /font-family:'Helvetica Neue'/, "the font stack reaches the body style");
// A port isn't valid in a Message-ID (Gmail then ignores it and the thread breaks): it is dropped.
assert.equal(orderThreadHeaders("abc", "confirmed", "localhost:3100")["Message-ID"], "<order.abc.confirmed@localhost>");
assert.equal(orderThreadHeaders("abc", "delivered", "localhost:3100", false, "9")["In-Reply-To"], "<order.abc.confirmed@localhost>");

console.log("email rules checks passed");
