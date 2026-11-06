import { formatProfileToolResult } from "@/lib/career/profiles/tools";
import { formatAgentContacts, type AgentContactSource } from "./contracts";
import { agentContactDatabase, readAgentContacts } from "./store";
import type { Database } from "@/lib/career/matching/internalScoring/database";
import { readIntroductionContexts } from "./introductionContext.server";
import { formatIntroductionContext } from "./introductionContext";

export async function readAgentCorrespondence(
  source: AgentContactSource,
  input: Record<string, any>,
  db: Database = agentContactDatabase()
) {
  const page = input.contextMessageId
    ? await readAgentContactContext(source, String(input.contextMessageId), db)
    : await readAgentContacts(
        {
          source,
          rootId: input.introductionRootId,
          roleId: input.roleId,
          messageId: input.messageId,
          offset: input.offset,
          talentId: input.talentId,
          workspaceId: input.workspaceId,
          newestFirst: input.newestFirst,
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
  const introductions = await readIntroductionContexts(db.query, roots, { companyAudience: source.kind !== "career" });
  const presentations = source.kind !== "career" && roots.length
    ? await db.query(`SELECT id,text,metadata->>'agentIntroductionRootId' AS root_id,
        metadata->>'sharedMaterialId' AS shared_material_id FROM public.talent_progress
        WHERE metadata->>'agentIntroductionRootId'=ANY($1::text[]) AND kind='intro_to_company'`, [roots])
    : [];
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
    introductions,
    presentations,
    deliveries: deliveries.slice(0, deliveryPageSize),
    nextDeliveryOffset,
    modelOutput: [
      ...("contextQuery" in page ? [`Current incoming message: ${input.contextMessageId}. Recent correspondence for this candidate, company and Role, plus the incoming message, its root and direct parent. ${page.nextOffset === null ? "No older page in this read." : `Older messages: read_agent_messages with ${JSON.stringify(page.contextQuery)} and offset=${page.nextOffset}.`}`] : []),
      ...introductions.map(formatIntroductionContext),
      ...presentations.map(p => `Current company presentation ${p.id}; introduction ${p.root_id}; shared material ${p.shared_material_id}.\n${p.text}\nTo replace this text, expectedPresentation is the exact current text above; replacement does not change shared materials or hiring progress.`),
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

/** The incoming message is an anchor, not a filter that discards its conversation. */
export async function readAgentContactContext(
  source: AgentContactSource,
  messageId: string,
  db: Database = agentContactDatabase()
) {
  const anchor = (await readAgentContacts({ source, messageId }, db)).messages[0];
  if (!anchor) throw new Error("Agent message unavailable in this scope");
  const contextQuery = {
    roleId: anchor.role_id, talentId: anchor.talent_id,
    workspaceId: anchor.company_workspace_id, newestFirst: true,
  };
  const recent = await readAgentContacts({ source, ...contextQuery }, db);
  const messages = new Map(recent.messages.map(message => [message.id, message]));
  messages.set(anchor.id, anchor);
  for (const id of [anchor.root_id, anchor.reply_to_id]) {
    if (!id || messages.has(id)) continue;
    const linked = (await readAgentContacts({ source, ...contextQuery, messageId: id }, db)).messages[0];
    if (linked) messages.set(linked.id, linked);
  }
  return { ...recent, contextQuery, messages: [...messages.values()].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime() || a.id.localeCompare(b.id)) };
}
