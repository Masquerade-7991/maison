"use server";

// The contact form's Server Action: a public endpoint, so every field is validated here. It mails the
// business inbox (CONTACT_TO, Reply-To set to the visitor) and sends the visitor an acknowledgement that
// repeats only their topic, never their message, so the form can't relay text to a stranger's inbox.
// Nothing else is stored. Without CONTACT_TO the message goes to the server log and the visitor is still thanked.
import { formValues, reader } from "@/lib/admin-rules";
import { parseContactForm, type ContactErrors } from "@/lib/contact-rules";
import { sendEmail, siteUrl } from "@/lib/email";
import { contactAckEmail, contactMessageEmail } from "@/lib/emails/templates";

export type ContactState =
  | { sent: true; name: string }
  | { sent?: false; errors?: ContactErrors; error?: string; values?: Record<string, string> }
  | null;

export async function sendContactAction(_prev: ContactState, fd: FormData): Promise<ContactState> {
  const get = reader(fd);
  // Hidden from people, filled in by bots: look successful, send nothing.
  if (get("website")) return { sent: true, name: get("name").trim().slice(0, 100) || "there" };

  const parsed = parseContactForm(get);
  if (!parsed.ok) return { errors: parsed.errors, values: formValues(fd) };
  const { name, email, orderRef, topic } = parsed.value;

  const to = process.env.CONTACT_TO;
  const message = contactMessageEmail(siteUrl(), { name, email, topic, orderRef, message: parsed.value.message });
  if (to) {
    const status = await sendEmail({ ...message, to, replyTo: email, kind: "contact.message" });
    if (status === "failed") return { error: "We couldn't send your message just now. Please try again in a moment.", values: formValues(fd) };
  } else console.info(`[contact] CONTACT_TO is not set; message logged instead\n${message.subject}\n${message.text}`);
  await sendEmail({ ...contactAckEmail(siteUrl(), name, topic, orderRef), to: email, kind: "contact.ack" });
  return { sent: true, name };
}
