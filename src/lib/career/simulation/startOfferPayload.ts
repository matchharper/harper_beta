import { z } from "zod";
export const START_OFFER_MARKER = "[[APPLICATION_START_OFFER]]";
const requestSchema = z.union([
  z.object({ roleId: z.string().min(1) }).strict(),
  z.object({ official_job_slug: z.string().min(1) }).strict(),
]);
export type StartOfferPayload = z.infer<typeof requestSchema>;
export function extractStartOfferPayload(text: string) {
  let request: StartOfferPayload | undefined;
  const content = text
    .replace(
      /\[\[APPLICATION_START_OFFER\]\]([\s\S]*?)\[\[\/APPLICATION_START_OFFER\]\]/g,
      (_, json) => {
        try {
          const parsed = requestSchema.safeParse(JSON.parse(json));
          if (parsed.success && !request) request = parsed.data;
        } catch {}
        return "";
      }
    )
    .split(START_OFFER_MARKER)[0]
    .trim();
  return { content, request };
}
export function startOfferVisibleLength(text: string) {
  const start = text.indexOf(START_OFFER_MARKER);
  if (start >= 0) return start;
  for (
    let n = Math.min(text.length, START_OFFER_MARKER.length - 1);
    n > 0;
    n--
  ) {
    if (text.endsWith(START_OFFER_MARKER.slice(0, n))) return text.length - n;
  }
  return text.length;
}
