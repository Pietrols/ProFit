// Pluggable mailer (AUDIT S3). Dev/default transport logs the mail instead
// of sending (codes land in the server console for manual flows and tests
// inject their own transport). Wire a real provider by setting MAIL_TRANSPORT
// and implementing it here — call sites never change.
import { logger } from "./logger";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export type MailTransport = (mail: Mail) => Promise<void>;

const consoleTransport: MailTransport = async (mail) => {
  // Deliberate: this is the ONE place an email address is logged, and only
  // on the dev transport. A production SMTP transport replaces it entirely.
  logger.info(
    { event: "mail.dev_transport", to: mail.to, subject: mail.subject, body: mail.text },
    "outbound mail (dev transport — not actually sent)",
  );
};

let transport: MailTransport = consoleTransport;

/** Test hook / provider wiring. */
export function setMailTransport(t: MailTransport) {
  transport = t;
}

export async function sendMail(mail: Mail): Promise<void> {
  await transport(mail);
}
