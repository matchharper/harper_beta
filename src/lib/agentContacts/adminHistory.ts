import type { Query } from "@/lib/career/matching/internalScoring/database";

export type AdminAgentMessage = {
  id: string;
  rootId: string;
  replyToId: string | null;
  direction: "to_company" | "to_talent";
  body: string;
  createdAt: string;
};
export type AdminAgentHistory = { messages: AdminAgentMessage[]; nextOffset: number | null };

/** The authenticated candidate and the selected Role jointly scope every page. */
export async function readAdminAgentHistory(
  query: Query, talentId: string, roleId: string, offset = 0
): Promise<AdminAgentHistory> {
  const pageSize = 30;
  const rows = await query(`SELECT id,root_id,reply_to_id,direction,body,created_at
    FROM public.agent_contact_messages
    WHERE talent_id=$1::uuid AND role_id=$2::uuid
    ORDER BY created_at,id OFFSET $3 LIMIT $4`, [talentId, roleId, offset, pageSize + 1]);
  return {
    messages: rows.slice(0, pageSize).map(row => ({
      id: row.id, rootId: row.root_id, replyToId: row.reply_to_id,
      direction: row.direction, body: row.body,
      createdAt: new Date(row.created_at).toISOString(),
    })),
    nextOffset: rows.length > pageSize ? offset + pageSize : null,
  };
}
