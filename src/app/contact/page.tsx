import type { Metadata } from "next";
import Link from "next/link";
import { ContactModal } from "@/components/contact-modal";
import { getSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Contact us | Maison",
  description: "Write to Maison client services about an order, sizing, care or returns.",
};

const help = [
  { title: "Orders and delivery", body: "Tracking, delivery times and changes to an order before it ships." },
  { title: "Sizing and fit", body: "Measurements, fit notes and advice on choosing between two sizes." },
  { title: "Care and repair", body: "How to look after a piece, and repairs for the life of everything we make." },
  { title: "Returns", body: "Returns within 30 days, in the original packaging, for a full refund." },
];

export default async function ContactPage() {
  // Only to fill in the form for signed-in customers; the page works the same for everyone.
  const session = await getSession();

  return (
    <section className="container-page py-12 md:py-20">
      <header className="max-w-2xl">
        <p className="label text-muted">Client services</p>
        <h1 className="mt-4 text-display">Contact us</h1>
        <p className="mt-6 text-muted">
          Our client advisors answer every message personally, usually within one working day. Tell us what you
          need and, if it&apos;s about an order, its reference (it starts with MSN).
        </p>
        <div className="mt-10">
          <ContactModal name={session?.user.name} email={session?.user.email} />
        </div>
      </header>

      <div className="rule mt-16 pt-10 md:mt-24">
        <h2 className="label text-muted">We can help with</h2>
        <ul className="mt-8 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {help.map((h) => (
            <li key={h.title}>
              <p className="font-medium">{h.title}</p>
              <p className="mt-2 text-muted">{h.body}</p>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-16 text-muted">
        Looking for an order?{" "}
        <Link href="/account/orders" className="link text-ink">See your orders</Link>
      </p>
    </section>
  );
}
