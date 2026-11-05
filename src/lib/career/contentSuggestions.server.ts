import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  CAREER_CONTENT_MAX_VISIBLE,
  CAREER_CONTENT_VISIBLE_STATUSES,
  readCareerContentSuggestionRow,
  sortCareerContentSuggestions,
  type CareerContentReaction,
} from "./contentSuggestions";

type Scope = { admin: TalentAdminClient; userId: string };
const COLUMNS =
  "id,kind,url,title,source,reason,starts_at,ends_at,location,published_at,expires_at,deadline,status,origin,created_at";

/** Items still shown on Career home: not dismissed/removed and not expired. */
export async function listCareerContentSuggestions({ admin, userId }: Scope) {
  const { data, error } = await admin
    .from("career_content_suggestions" as never)
    .select(COLUMNS)
    .eq("user_id", userId)
    .in("status", [...CAREER_CONTENT_VISIBLE_STATUSES])
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(CAREER_CONTENT_MAX_VISIBLE);
  if (error) throw error;
  return sortCareerContentSuggestions(
    ((data ?? []) as Record<string, unknown>[]).map(
      readCareerContentSuggestionRow
    )
  );
}

export async function manageCareerContentSuggestion(
  scope: Scope,
  args: {
    operation: "add" | "remove" | "react";
    id?: string | null;
    item?: Record<string, unknown> | null;
    origin?: "user_request" | "harper_offer" | "harper_background" | null;
    conversationId?: string | null;
    runId?: string | null;
  }
) {
  const { data, error } = await (scope.admin.rpc as any)(
    "manage_career_content_suggestion",
    {
      p_user_id: scope.userId,
      p_operation: args.operation,
      p_id: args.id ?? null,
      p_item: args.item ?? null,
      p_origin: args.origin ?? null,
      p_conversation_id: args.conversationId ?? null,
      p_run_id: args.runId ?? null,
    }
  );
  if (error) throw error;
  const result = data as {
    status: string;
    id: string | null;
    item?: Record<string, unknown> | null;
  };
  return {
    status: result.status,
    id: result.id,
    item: result.item ? readCareerContentSuggestionRow(result.item) : null,
  };
}

export function reactToCareerContentSuggestion(
  scope: Scope,
  id: string,
  reaction: CareerContentReaction
) {
  return manageCareerContentSuggestion(scope, {
    operation: "react",
    id,
    item: { reaction },
  });
}
