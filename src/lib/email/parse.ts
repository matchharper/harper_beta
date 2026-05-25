const EMAIL_ADDRESS_PATTERN = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i;

const REPLY_ALIAS_PATTERN = /^(?:reply|harper)\+([A-Za-z0-9_-]{12,})$/i;

export function normalizeEmailAddress(value: string | null | undefined) {
  const email = extractEmailAddress(value);
  return email ? email.toLowerCase() : null;
}

export function extractEmailAddress(value: string | null | undefined) {
  const input = String(value ?? "").trim();
  if (!input) return null;

  const angleMatch = input.match(/<([^<>]+)>/);
  const candidate = angleMatch?.[1] ?? input;
  const match =
    candidate.match(EMAIL_ADDRESS_PATTERN) ??
    input.match(EMAIL_ADDRESS_PATTERN);
  return match?.[1]?.trim() || null;
}

export function normalizeAddressList(value: unknown) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  return values
    .map((item) => {
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        return String(
          record.email ?? record.address ?? record.value ?? ""
        ).trim();
      }
      return String(item ?? "").trim();
    })
    .filter((item) => item.length > 0);
}

export function extractReplyAliasTokens(args: {
  addresses: readonly string[];
  domain?: string | null;
}) {
  const expectedDomain = String(args.domain ?? "")
    .trim()
    .toLowerCase();
  const tokens: string[] = [];

  for (const rawAddress of args.addresses) {
    const email = extractEmailAddress(rawAddress);
    if (!email) continue;

    const [localPart = "", domain = ""] = email.split("@");
    if (expectedDomain && domain.toLowerCase() !== expectedDomain) continue;

    const match = localPart.match(REPLY_ALIAS_PATTERN);
    if (match?.[1]) {
      tokens.push(match[1]);
    }
  }

  return Array.from(new Set(tokens));
}

export function htmlToPlainText(html: string | null | undefined) {
  return String(html ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function stripQuotedEmailText(text: string) {
  const lines = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n");
  const kept: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^On .+ wrote:$/i.test(trimmed)) break;
    if (/^From:\s/i.test(trimmed) && kept.length > 0) break;
    if (/^-{2,}\s*Original Message\s*-{2,}$/i.test(trimmed)) break;
    if (/^>/.test(trimmed)) continue;
    kept.push(line);
  }

  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 8000);
}

export function buildReplySubject(subject: string | null | undefined) {
  const normalized = String(subject ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "Re: Harper";
  return /^re:/i.test(normalized) ? normalized : `Re: ${normalized}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function textToSimpleEmailHtml(text: string) {
  const paragraphs = String(text ?? "")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  return paragraphs
    .map(
      (paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`
    )
    .join("");
}

export function getHeader(
  headers: Record<string, unknown> | null | undefined,
  name: string
) {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === lowerName) {
      return String(value ?? "").trim();
    }
  }
  return "";
}

export function isLikelyAutomatedEmail(args: {
  fromEmail?: string | null;
  headers?: Record<string, unknown> | null;
}) {
  const from = String(args.fromEmail ?? "").toLowerCase();
  if (
    /(^|[._-])(no-?reply|donotreply|mailer-daemon|postmaster|bounce)([._-]|@)/i.test(
      from
    )
  ) {
    return "automated_sender";
  }

  const autoSubmitted = getHeader(args.headers, "Auto-Submitted").toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") {
    return "auto_submitted";
  }

  const precedence = getHeader(args.headers, "Precedence").toLowerCase();
  if (["bulk", "junk", "list"].includes(precedence)) {
    return "bulk_or_list";
  }

  if (
    getHeader(args.headers, "List-Id") ||
    getHeader(args.headers, "List-Unsubscribe")
  ) {
    return "mailing_list";
  }

  return null;
}

export function mergeReferences(args: {
  inboundMessageId?: string | null;
  existingReferences?: string | null;
}) {
  const existing = String(args.existingReferences ?? "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const inbound = String(args.inboundMessageId ?? "").trim();
  return Array.from(new Set([...existing, inbound].filter(Boolean))).join(" ");
}
