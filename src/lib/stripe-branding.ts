// Stripe's hosted Checkout page lives on Stripe's domain, so our stylesheet and fonts cannot reach
// it. Branding Settings is the only supported way to carry the design language across: these values
// mirror globals.css (paper/ink, square corners, the tracked wordmark) and Inter is the closest
// Checkout-supported grotesque to Geist. Stripe still owns the page layout itself.
import type Stripe from "stripe";

const DISPLAY_NAME = "Maison";

// Stripe fetches the logo URL itself, so it can only be attached once the app has a public https
// origin: in local development BETTER_AUTH_URL is http://localhost:3000, which Stripe cannot reach.
function publicOrigin(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

export function checkoutAppearance(
  baseUrl: string,
): Pick<Stripe.Checkout.SessionCreateParams, "branding_settings" | "custom_text" | "locale"> {
  const origin = publicOrigin(baseUrl);
  return {
    branding_settings: {
      display_name: DISPLAY_NAME,
      background_color: "#ffffff", // --paper
      button_color: "#000000", // --ink
      border_style: "rectangular", // square corners everywhere
      font_family: "inter",
      ...(origin ? { logo: { type: "url" as const, url: `${origin}/brand/maison-wordmark.png` } } : {}),
    },
    locale: "en", // English copy regardless of the customer's browser locale
    custom_text: {
      submit: { message: "Payments are secured and encrypted by Stripe." },
      shipping_address: { message: "US delivery only. Every piece is wrapped and boxed in our signature packaging." },
      after_submit: { message: "Complimentary express delivery, with a signature on arrival." },
    },
  };
}
