import { normalizeCareerPromptTimeZone } from "@/lib/career/prompts/promptUtils";

type RequestWithHeaders = {
  headers: Pick<Headers, "get">;
};

export function getCareerBrowserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export function resolveCareerRequestTimeZone(
  request: RequestWithHeaders,
  clientTimeZone?: string | null
) {
  const requestTimeZone = request.headers.get("x-vercel-ip-timezone")?.trim();
  return normalizeCareerPromptTimeZone(requestTimeZone || clientTimeZone);
}
