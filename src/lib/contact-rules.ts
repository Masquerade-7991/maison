// Contact form rules. Pure (no db), so the check file and the client form can import them; the copy that
// counts runs in the Server Action.

export const CONTACT_TOPICS = ["Order", "Product and sizing", "Returns", "Other"] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export type ContactInput = { name: string; email: string; orderRef: string | null; topic: ContactTopic; message: string };
export type ContactField = keyof ContactInput;
export type ContactErrors = Partial<Record<ContactField, string>>;

export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 4000;

// ponytail: shape check only; a reply bouncing is the real test of an address.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ORDER_REF = /^MSN-[0-9A-F]{8}$/;

type Get = (name: string) => string;

export function parseContactForm(get: Get): { ok: true; value: ContactInput } | { ok: false; errors: ContactErrors } {
  const errors: ContactErrors = {};

  const name = get("name").trim();
  if (!name) errors.name = "Enter your name.";
  else if (name.length > 100) errors.name = "Use 100 characters or fewer.";

  const email = get("email").trim();
  if (!email) errors.email = "Enter your email address.";
  else if (email.length > 254 || !EMAIL.test(email)) errors.email = "Enter a valid email address, like name@example.com.";

  const rawRef = get("orderRef").trim().toUpperCase();
  const orderRef = rawRef || null;
  if (orderRef && !ORDER_REF.test(orderRef)) errors.orderRef = "Order references look like MSN-1A2B3C4D, or leave it empty.";

  const topic = get("topic") as ContactTopic;
  if (!CONTACT_TOPICS.includes(topic)) errors.topic = "Choose a topic.";

  const message = get("message").trim();
  if (message.length < MESSAGE_MIN) errors.message = `Tell us a little more (at least ${MESSAGE_MIN} characters).`;
  else if (message.length > MESSAGE_MAX) errors.message = `Keep it under ${MESSAGE_MAX.toLocaleString("en")} characters.`;

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, email, orderRef, topic, message } };
}
