import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { parseCareerInlineUi } from "../inlineUi";

/** Form ids that a reply already shows with [[form:id]] or [[forms:[...]]]. */
export function shownFormIds(text: string): Set<number> {
  return new Set(parseCareerInlineUi(text).flatMap(part =>
    part.kind === "ui" && part.reference.type === "forms" ? part.reference.formIds : []));
}

/** Show the given forms at the end of the reply when the reply does not place them. */
export function withFormMarkers(text: string, formIds: number[]): string {
  const shown = shownFormIds(text);
  const missing = [...new Set(formIds)].filter(id => Number.isSafeInteger(id) && id > 0 && !shown.has(id));
  if (!missing.length) return text;
  const marker = missing.length === 1 ? `[[form:${missing[0]}]]` : `[[forms:${JSON.stringify(missing)}]]`;
  return text.trim() ? `${text.trimEnd()}\n\n${marker}` : marker;
}

type FormRow = { id: number; payload: Record<string, unknown> | null };

/** A new application review form: linked to a role or opportunity, not hidden, first revision. */
function isApplicationReview(row: FormRow) {
  const payload = row.payload ?? {};
  if (payload.hidden === true || payload.hidden === "true") return false;
  if ((payload.kind ?? "form") !== "form") return false;
  if (String(payload.revision ?? "1") !== "1") return false;
  const refs = Array.isArray(payload.relatedRefs) ? payload.relatedRefs : [];
  return refs.some(ref => ref && typeof ref === "object" && ["role", "opportunity"].includes(String((ref as Record<string, unknown>).type)));
}

/** A browser run still preparing may be followed by one bundled review of all forms. */
const BUNDLE_WAIT_MS = 30 * 60_000;
const FINISHED_RUN = ["completed", "cancelled", "failed"];

/**
 * Application review forms saved since the previous reply that no reply has shown.
 * Without the reply's [[form:id]] such a form is visible only on the opportunity
 * page (11/19-25: 21 of 418 new review forms never reached the chat). While
 * another browser run of this conversation is still working, Harper may be
 * holding forms for one bundled review, so none are returned.
 */
export async function readUnshownReviewFormIds(admin: TalentAdminClient, args: { userId: string; conversationId: string; now?: number }): Promise<number[]> {
  const messages = () => (admin.from as any)("talent_messages");
  const { data: previous, error: previousError } = await messages().select("created_at")
    .eq("user_id", args.userId).eq("conversation_id", args.conversationId)
    .eq("role", "assistant").eq("message_type", "chat")
    .order("id", { ascending: false }).limit(1).maybeSingle();
  if (previousError) throw previousError;
  let forms = messages().select("id, payload")
    .eq("user_id", args.userId).eq("conversation_id", args.conversationId)
    .eq("message_type", "career_form");
  if (previous?.created_at) forms = forms.gt("created_at", previous.created_at);
  const { data, error } = await forms.order("id", { ascending: true }).limit(20);
  if (error) throw error;
  const ids = ((data ?? []) as FormRow[]).filter(isApplicationReview).map(row => Number(row.payload?.formId ?? row.id));
  if (!ids.length) return [];
  const since = new Date((args.now ?? Date.now()) - BUNDLE_WAIT_MS).toISOString();
  const { data: running, error: runError } = await (admin.from as any)("talent_external_operations").select("id")
    .eq("user_id", args.userId).eq("conversation_id", args.conversationId).eq("kind", "browser_run")
    .gte("created_at", since).not("status", "in", `(${FINISHED_RUN.join(",")})`).limit(1);
  if (runError) throw runError;
  return running?.length ? [] : ids;
}
