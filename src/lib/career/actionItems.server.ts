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
