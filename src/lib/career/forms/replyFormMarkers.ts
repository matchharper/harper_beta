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

type FormRow = { id: number; created_at?: string; payload: Record<string, unknown> | null };

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
/** Open review forms older than this are left to the opportunity page and re-engagement. */
const UNSHOWN_WINDOW_MS = 7 * 24 * 60 * 60_000;
const UNSHOWN_LIMIT = 20;

/**
 * Open application review forms that no reply has shown yet. Without the reply's [[form:id]] such a form is
 * visible only on the opportunity page (11/19-25: 21 of 418 new review forms never reached the chat). While
 * another browser run of this conversation is still working, Harper may be holding forms for one bundled review,
 * so none are returned then; they stay unshown and come with a later reply (11/27: reading only the forms saved
 * since the previous reply lost the ones held while other preparations ran).
 */
export async function readUnshownReviewFormIds(admin: TalentAdminClient, args: { userId: string; conversationId: string; now?: number }): Promise<number[]> {
  const now = args.now ?? Date.now();
  const { data: open, error: openError } = await (admin.rpc as any)("read_open_career_forms", {
    p_user_id: args.userId, p_conversation_id: args.conversationId,
  });
  if (openError) throw openError;
  const recent = new Date(now - UNSHOWN_WINDOW_MS).toISOString();
  const candidates = ((open ?? []) as FormRow[])
    .filter(row => isApplicationReview(row) && String(row.created_at ?? "") >= recent)
    .slice(-UNSHOWN_LIMIT);
  if (!candidates.length) return [];
  const { data: replies, error: replyError } = await (admin.from as any)("talent_messages").select("content")
    .eq("user_id", args.userId).eq("conversation_id", args.conversationId)
    .eq("role", "assistant").eq("message_type", "chat")
    .gte("created_at", candidates[0].created_at ?? recent)
    .order("id", { ascending: false }).limit(200);
  if (replyError) throw replyError;
  const shown = new Set(((replies ?? []) as { content: string | null }[]).flatMap(reply => [...shownFormIds(reply.content ?? "")]));
  const ids = candidates.map(row => Number(row.payload?.formId ?? row.id)).filter(id => !shown.has(id));
  if (!ids.length) return [];
  const since = new Date(now - BUNDLE_WAIT_MS).toISOString();
  const { data: running, error: runError } = await (admin.from as any)("talent_external_operations").select("id")
    .eq("user_id", args.userId).eq("conversation_id", args.conversationId).eq("kind", "browser_run")
    .gte("created_at", since).not("status", "in", `(${FINISHED_RUN.join(",")})`).limit(1);
  if (runError) throw runError;
  return running?.length ? [] : ids;
}
