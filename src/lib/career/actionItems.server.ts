import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  careerActionItemSchema,
  sortCareerActionItems,
  type CareerActionItem,
} from "./actionItems";

type Scope = { admin: TalentAdminClient; userId: string };
export function readCareerActionItemRow(
  row: Record<string, unknown>
): CareerActionItem {
  return careerActionItemSchema.parse({ ...row, buttonText: row.button_text });
}
export async function listCareerActionItems({ admin, userId }: Scope) {
  const { data, error } = await admin
    .from("career_action_items" as never)
    .select("id,revision,title,description,button_text,action,priority,urgency")
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (error) throw error;
  return sortCareerActionItems(
    (data ?? []).map((row) => readCareerActionItemRow(row))
  );
}
export async function readCareerActionItem({
  admin,
  userId,
  id,
}: Scope & { id: string }) {
  const { data, error } = await admin
    .from("career_action_items" as never)
    .select("id,revision,title,description,button_text,action,priority,urgency")
    .eq("user_id", userId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? readCareerActionItemRow(data) : null;
}

/** The user closes a follow-up on Career home: the same delete Harper's tool runs. */
export async function closeCareerActionItem({
  admin,
  userId,
  conversationId,
  id,
  revision,
}: Scope & { conversationId: string; id: string; revision: number }) {
  const { data, error } = await (admin.rpc as any)(
    "manage_career_action_item",
    {
      p_user_id: userId,
      p_conversation_id: conversationId,
      p_operation: "delete",
      p_id: id,
      p_expected_revision: revision,
      p_item: null,
      p_creation_key: null,
    }
  );
  if (error) throw error;
  return data as { status: "deleted" | "not_found" | "conflict"; id: string };
}
