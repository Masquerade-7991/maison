// Delivery details for UPI checkout (Razorpay's page collects no address, unlike Stripe's). Pure (no db), so
// the check file and the client form can import them; the copy that counts runs in the Server Action. The
// address comes out in Stripe's shape, so order pages and emails show it unchanged.

export const ADDRESS_FIELDS = ["name", "phone", "line1", "line2", "city", "state", "postalCode"] as const;
export type AddressField = (typeof ADDRESS_FIELDS)[number];

// 28 states and 8 union territories.
export const INDIAN_STATES: string[] = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

/** UPI's per-payment cap for shopping: ₹1,00,000. */
export const UPI_MAX_PAISE = 10_000_000;

export const upiAllowed = (marketId: string, currency: string, subtotalMinor: number) =>
  marketId === "in" && currency.toLowerCase() === "inr" && subtotalMinor > 0 && subtotalMinor <= UPI_MAX_PAISE;

/** The UPI flows a Razorpay account has: `upi` is the QR code (computers), `intent` opens the UPI app (phones). */
export type UpiMethods = { upi: boolean; intent: boolean };

/**
 * UPI works for this visitor when the account has the QR code (any device), or has intent and the visitor
 * is on a phone. Without either, Razorpay's window only says "No appropriate payment method found".
 */
export const upiDeviceReady = (userAgent: string, m: UpiMethods | null) =>
  Boolean(m && (m.upi || (m.intent && /Android|iPhone|iPad|iPod/i.test(userAgent))));

export type IndianAddress = { line1: string; line2: string | null; city: string; state: string; postal_code: string; country: "IN" };

// Spaces, dashes and brackets are ignored; then an optional +91, 91 or 0 before a 10-digit mobile number.
const MOBILE = /^(?:\+?91|0)?([6-9]\d{9})$/;
const PIN = /^[1-9]\d{5}$/;

export function parseAddressForm(
  get: (k: AddressField) => string,
): { ok: true; value: { name: string; phone: string; address: IndianAddress } } | { ok: false; errors: Partial<Record<AddressField, string>> } {
  const errors: Partial<Record<AddressField, string>> = {};

  const name = get("name").trim();
  if (name.length < 2) errors.name = "Enter the name to deliver to.";
  else if (name.length > 100) errors.name = "Use 100 characters or fewer.";

  const mobile = get("phone").replace(/[\s\-()]/g, "").match(MOBILE)?.[1];
  if (!mobile) errors.phone = "Enter a 10-digit Indian mobile number, like 98765 43210.";

  const line1 = get("line1").trim();
  if (!line1) errors.line1 = "Enter the house number and street.";
  else if (line1.length > 200) errors.line1 = "Use 200 characters or fewer.";

  const line2 = get("line2").trim();
  if (line2.length > 200) errors.line2 = "Use 200 characters or fewer.";

  const city = get("city").trim();
  if (!city) errors.city = "Enter the town or city.";
  else if (city.length > 100) errors.city = "Use 100 characters or fewer.";

  const state = get("state").trim();
  if (!INDIAN_STATES.includes(state)) errors.state = "Choose a state or union territory.";

  const postalCode = get("postalCode").replace(/\s/g, "");
  if (!PIN.test(postalCode)) errors.postalCode = "Enter the 6-digit PIN code.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: { name, phone: `+91${mobile}`, address: { line1, line2: line2 || null, city, state, postal_code: postalCode, country: "IN" } },
  };
}
