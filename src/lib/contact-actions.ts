"use server";

// The contact form's Server Action: a public endpoint, so every field is validated here. It "mails the
// business" through sendEmail to CONTACT_TO. Nothing is stored. Until there is a business mailbox
// (no CONTACT_TO, or email off), the message goes to the server log and the visitor is still thanked.
import { formValues, reader } from "@/lib/admin-rules";
import { parseContactForm, type ContactErrors } from "@/lib/contact-rules";
import { emailIsOff, sendEmail } from "@/lib/email";

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
  const { name, email, orderRef, topic, message } = parsed.value;

  const mail = {
    to: process.env.CONTACT_TO ?? "",
    subject: `Contact: ${topic}${orderRef ? ` (${orderRef})` : ""} from ${name}`,
    text: `From: ${name} <${email}>\nTopic: ${topic}${orderRef ? `\nOrder: ${orderRef}` : ""}\n\n${message}\n\nReply to ${email}.`,
  };
  try {
    if (mail.to || emailIsOff()) await sendEmail(mail); // emailIsOff: sendEmail only logs
    else console.info(`[contact] CONTACT_TO is not set; message logged instead\n${mail.subject}\n${mail.text}`);
  } catch (e) {
    console.error("[contact] could not send:", e);
    return { error: "We couldn't send your message just now. Please try again in a moment.", values: formValues(fd) };
  }
  return { sent: true, name };
}
