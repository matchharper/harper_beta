import { stripPostgresUnsafeChars } from "@/lib/textSanitization";

type HeadersLike = {
  get(name: string): string | null;
};

const MOBILE_USER_AGENT_PATTERN =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i;

export function isMobileUserAgent(userAgent: string | null | undefined) {
  return MOBILE_USER_AGENT_PATTERN.test(userAgent ?? "");
}

export function isMobileHeaders(headers: HeadersLike) {
  const mobileClientHint = headers.get("sec-ch-ua-mobile")?.trim().toLowerCase();
  if (
    mobileClientHint === "?1" ||
    mobileClientHint === "1" ||
    mobileClientHint === "true"
  ) {
    return true;
  }
  if (
    mobileClientHint === "?0" ||
    mobileClientHint === "0" ||
    mobileClientHint === "false"
  ) {
    return false;
  }

  return isMobileUserAgent(headers.get("user-agent"));
}

export function isMobileRequest(req: { headers: HeadersLike }) {
  return isMobileHeaders(req.headers);
}

export function withIsMobile<T extends object>(
  payload: T,
  isMobile: boolean | null | undefined
): T & { is_mobile?: boolean } {
  const sanitizedPayload =
    "content" in payload && typeof payload.content === "string"
      ? {
          ...payload,
          content: stripPostgresUnsafeChars(payload.content),
        }
      : payload;
  if (typeof isMobile !== "boolean") return sanitizedPayload;
  return {
    ...sanitizedPayload,
    is_mobile: isMobile,
  };
}
