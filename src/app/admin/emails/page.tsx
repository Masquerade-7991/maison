import type { Metadata } from "next";
import { emailPreviews } from "@/lib/admin-emails";
import { emailIsOff } from "@/lib/email";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Emails | Admin | Maison" };

// Every email the shop sends, rendered with real data (the latest paid order), each in an isolated frame
// at a typical mail-app width, so the design can be checked without placing orders.
export default async function EmailsPage() {
  await requireAdmin("/admin/emails");
  const previews = await emailPreviews();
  const groups = [...new Set(previews.map((p) => p.group))];

  return (
    <>
      <h2 className="label">Emails ({previews.length})</h2>
      <p className="mt-3 max-w-2xl text-muted">
        {emailIsOff()
          ? "Email is switched off here, so messages only reach the server log. Set SMTP_URL and EMAIL_FROM to send them."
          : `Sending from ${process.env.EMAIL_FROM}.`}{" "}
        Order emails use the latest paid order. All emails about one order share a subject, so they arrive as one conversation.
      </p>
      <nav aria-label="Emails" className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
        {previews.map((p) => (
          <a key={p.id} href={`#${p.id}`} className="label link-nav text-muted hover:text-ink">{p.title}</a>
        ))}
      </nav>
      {groups.map((g) => (
        <section key={g} className="mt-12">
          <h3 className="label border-b border-line pb-3">{g}</h3>
          <ul className="mt-6 grid gap-10 xl:grid-cols-2">
            {previews
              .filter((p) => p.group === g)
              .map((p) => (
                <li key={p.id} id={p.id} className="scroll-mt-24">
                  <p className="label text-muted">{p.title}</p>
                  <p className="mt-1 truncate">Subject: {p.subject}</p>
                  <iframe title={p.title} srcDoc={p.html} sandbox="" className="mt-3 h-[44rem] w-full max-w-[600px] border border-line bg-white" />
                </li>
              ))}
          </ul>
        </section>
      ))}
    </>
  );
}
