import {
  renderEmailBodyHtml,
  renderEmailBodyText,
} from "@/lib/ats/emailBodyFormat";

function readEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export async function sendInternalEmail(args: {
  from: string;
  subject: string;
  text: string;
  to: string;
}) {
  const resendApiKey = readEnv("RESEND_API_KEY");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: args.from,
      to: [args.to],
      subject: args.subject,
      text: renderEmailBodyText(args.text),
      html: renderEmailBodyHtml(args.text),
    }),
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    throw new Error(`Failed to send email: ${payload || response.status}`);
  }

  return response.json().catch(() => ({}));
}
