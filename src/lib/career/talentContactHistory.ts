import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

export async function readTalentContactHistory(args: {
  admin: TalentAdminClient; userId: string; limit?: number; cursor?: string | null;
  query?: string | null; refs?: string[];
}) {
  const { data, error } = await (args.admin.rpc as any)("read_talent_contact_history_v1", {
    p_talent_id: args.userId, p_limit: args.limit ?? 5, p_before_id: args.cursor ?? null,
    p_query: args.query ?? null, p_refs: args.refs?.length ? args.refs.slice(0, 3) : null,
  });
  if (error) throw new Error(error.message ?? "Could not read contact history");
  return data as { items: {ref: string; sentAt: string; question: string; roleIds: string[] | null; channel: string}[]; nextCursor: string | null; meaning: string };
}
