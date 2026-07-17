type SendResendEmailArgs = {
  cc?: string[];
  from?: string | null;
  headers?: Record<string, string>;
  html: string;
  idempotencyKey?: string;
  replyTo?: string | null;
  subject: string;
  text: string;
  to: string;
};

function readResendApiKey() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is required");
  }
  return apiKey;
}

export function getDefaultResendFromEmail() {
  const from =
    process.env.EMAIL_REPLY_FROM_EMAIL?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim();
  if (!from) {
    throw new Error("EMAIL_REPLY_FROM_EMAIL or RESEND_FROM_EMAIL is required");
  }
  return from;
}

export async function sendResendEmail(args: SendResendEmailArgs) {
  const payload: Record<string, unknown> = {
    from: args.from?.trim() || getDefaultResendFromEmail(),
    to: [args.to],
    subject: args.subject,
    text: args.text,
    html: args.html,
  };
  if (args.cc && args.cc.length > 0) {
    payload.cc = args.cc;
  }
  if (args.headers && Object.keys(args.headers).length > 0) {
    payload.headers = args.headers;
  }
  if (args.replyTo?.trim()) {
    payload.reply_to = args.replyTo.trim();
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${readResendApiKey()}`,
    "Content-Type": "application/json",
    "User-Agent": "harper-next-mailer/0.1",
  };
  if (args.idempotencyKey) {
    headers["Idempotency-Key"] = args.idempotencyKey.slice(0, 256);
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const raw = await response.text().catch(() => "");
  let data: unknown = raw;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }

  if (!response.ok) {
    throw new Error(
      `Failed to send email: HTTP ${response.status} ${JSON.stringify(data)}`
    );
  }

  return data as { id?: string };
}
