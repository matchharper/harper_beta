import { formatProfileToolResult } from "@/lib/career/profiles/tools";
import { formatAgentContacts, type AgentContactSource } from "./contracts";
import { agentContactDatabase, readAgentContacts } from "./store";
import type { Database } from "@/lib/career/matching/internalScoring/database";

export async function readAgentCorrespondence(
  source: AgentContactSource,
  input: Record<string, any>,
  db: Database = agentContactDatabase()
) {
  const page = await readAgentContacts(
    {
      source,
      rootId: input.introductionRootId,
      roleId: input.roleId,
      messageId: input.messageId,
      offset: input.offset,
    },
    db
  );
  const ids = [
    ...new Set(page.messages.map((m) => m.material_id).filter(Boolean)),
  ];
  const materials = ids.length
    ? await db.query(
        "SELECT * FROM public.talent_role_materials WHERE id=ANY($1::uuid[])",
        [ids]
      )
    : [];
  // Only the company's own delivery facts for introductions already authorized above.
  // Provider status is not evidence that a team member read the email.
  const roots = [...new Set(page.messages.map((message) => message.root_id))];
  const deliveryPageSize = 30;
  const deliveries =
    source.kind !== "career" && roots.length
      ? await db.query(
          `SELECT id,status,created_at,sent_at,provider_id,draft,snapshot->>'rootId' AS root_id
       FROM public.company_email_outbox WHERE topic='agent_contact_v1'
       AND snapshot->>'workspaceId'=$1 AND snapshot->>'rootId'=ANY($2::text[])
       ORDER BY created_at,id OFFSET $3 LIMIT $4`,
          [
            source.workspaceId,
            roots,
            input.deliveryOffset ?? 0,
            deliveryPageSize + 1,
          ]
        )
      : [];
  const nextDeliveryOffset =
    deliveries.length > deliveryPageSize
      ? (input.deliveryOffset ?? 0) + deliveryPageSize
      : null;
  return {
    ...page,
    deliveries: deliveries.slice(0, deliveryPageSize),
    nextDeliveryOffset,
    modelOutput: [
      formatAgentContacts(page.messages, page.nextOffset),
      ...deliveries
        .slice(0, deliveryPageSize)
        .map(
          (receipt) =>
            `Own-company email ${receipt.id}; introduction ${receipt.root_id}; ${receipt.status}; created ${receipt.created_at}; sent ${receipt.sent_at ?? "not recorded"}. Readership unknown.\nSubject: ${receipt.draft.subject}\n${receipt.draft.body}`
        ),
      ...(nextDeliveryOffset !== null
        ? [
            `More own-company email receipts: repeat the same correspondence references with deliveryOffset=${nextDeliveryOffset}.`,
          ]
        : []),
      ...materials.map((m) =>
        [
          `Shared material ${m.id}; Role ${m.role_id}. Snapshot at the time of sharing.`,
          formatProfileToolResult("read_profile", {
            profileId: m.profile_id,
            revision: m.profile_revision,
            snapshot: m.profile_snapshot,
          }),
          ...(m.documents ?? []).map(
            (d: any) =>
              `Shared document ${d.id}; revision ${d.revision ?? 1}; ${d.file_name ?? ""}\n${d.content ?? d.text ?? d.extracted_text ?? ""}`
          ),
        ].join("\n")
      ),
    ].join("\n\n"),
  };
}
