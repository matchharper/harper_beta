import { formatProfileToolResult } from "@/lib/career/profiles/tools";
import { formatAgentContacts, type AgentContactSource } from "./contracts";
import { agentContactDatabase, readAgentContacts } from "./store";
import type { Database } from "@/lib/career/matching/internalScoring/database";
import { readIntroductionContexts } from "./introductionContext.server";
import { formatIntroductionContext } from "./introductionContext";
import { formatOrgProcessClosureForCompanyAgent, readOrgCurrentProcessClosures } from "@/lib/org/processClosureNotification";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";

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
  // These reads depend on the authorized correspondence page, not on each other.
  const roots = [...new Set(page.messages.map((message) => message.root_id))];
  const deliveryPageSize = 30;
  const pairs = [...new Map(page.messages.map((m) => [`${m.talent_id}:${m.role_id}`, { talentId: m.talent_id, roleId: m.role_id }])).values()];
  const [materials, introductions, presentations, deliveries, closures, notices] = await Promise.all([
    ids.length
      ? db.query("SELECT * FROM public.talent_role_materials WHERE id=ANY($1::uuid[])", [ids])
      : Promise.resolve([]),
    readIntroductionContexts(db.query, roots, { companyAudience: source.kind !== "career" }),
    source.kind !== "career" && roots.length
      ? db.query(`SELECT id,text,metadata->>'agentIntroductionRootId' AS root_id,
          metadata->>'sharedMaterialId' AS shared_material_id FROM public.talent_progress
          WHERE metadata->>'agentIntroductionRootId'=ANY($1::text[]) AND kind='intro_to_company'`, [roots])
      : Promise.resolve([]),
    // Only the company's own delivery facts for introductions authorized above.
    source.kind !== "career" && roots.length
      ? db.query(
          `SELECT id,status,created_at,sent_at,provider_id,draft,snapshot->>'rootId' AS root_id
       FROM public.company_email_outbox WHERE topic='agent_contact_v1'
       AND snapshot->>'workspaceId'=$1 AND snapshot->>'rootId'=ANY($2::text[])
       ORDER BY created_at,id OFFSET $3 LIMIT $4`,
          [source.workspaceId, roots, input.deliveryOffset ?? 0, deliveryPageSize + 1],
        )
      : Promise.resolve([]),
    // The company's own closure decision for these pairs; never shown to the candidate side.
    source.kind !== "career"
      ? readOrgCurrentProcessClosures(db.query, pairs)
      : Promise.resolve(new Map()),
    // What the company's own team was already told about these introductions; never shown to the candidate side.
    source.kind !== "career" && roots.length
      ? readCompanyIntroductionNotices(db, source.workspaceId, roots)
      : Promise.resolve([]),
  ]);
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
      ...pairs.flatMap(({ talentId, roleId }) => {
        const closure = closures.get(`${talentId}:${roleId}`);
        const candidateName = introductions.find((i) => i.talentId === talentId && i.roleId === roleId)?.candidateName ?? null;
        return closure ? [formatOrgProcessClosureForCompanyAgent({ candidateName, closure, roleId })] : [];
      }),
      ...presentations.map(p => `Current company presentation ${p.id}; introduction ${p.root_id}; shared material ${p.shared_material_id}.\n${p.text}\nTo replace this text, expectedPresentation is the exact current text above; replacement does not change shared materials or hiring progress.`),
      formatAgentContacts(page.messages, page.nextOffset),
      ...formatCompanyIntroductionNotices(notices),
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

type CompanyIntroductionNotice = { id: number | string; created_at: unknown; root_id: string; content: string | null; total: number | string };
const NOTICES_PER_INTRODUCTION = 5;
const NOTICE_HEAD_LENGTH = 200;

/**
 * Messages Harper already posted to the company's team (web or Slack) about
 * these introductions, newest few per introduction. A later run reads them so
 * it can tell the team what changed instead of repeating the first notice.
 * Slack copies of a web message are left out, as in the company conversation.
 */
async function readCompanyIntroductionNotices(db: Database, workspaceId: string, roots: string[]) {
  return (await db.query(
    `SELECT id,created_at,root_id,content,total FROM (
      SELECT m.id,m.created_at,m.content,m.metadata->>'agentIntroductionRootId' AS root_id,
        row_number() OVER (PARTITION BY m.metadata->>'agentIntroductionRootId' ORDER BY m.id DESC) AS recent,
        count(*) OVER (PARTITION BY m.metadata->>'agentIntroductionRootId') AS total
      FROM public.company_messages m
      WHERE m.company_workspace_id=$1::uuid AND m.role='assistant' AND m.message_type IN ('chat','slack')
        AND m.metadata->>'agentIntroductionRootId'=ANY($2::text[])
        AND NOT m.metadata ? 'companyEventUiDuplicateOf'
    ) notice WHERE recent<=$3 ORDER BY root_id,id`,
    [workspaceId, roots, NOTICES_PER_INTRODUCTION]
  )) as CompanyIntroductionNotice[];
}

export function formatCompanyIntroductionNotices(notices: CompanyIntroductionNotice[]) {
  const roots = [...new Set(notices.map((notice) => notice.root_id))];
  return roots.map((root) => {
    const shown = notices.filter((notice) => notice.root_id === root);
    const total = Number(shown[0].total);
    const lines = shown.map((notice) => {
      const text = String(notice.content ?? "").replace(/\s+/g, " ").trim();
      const head = text.length > NOTICE_HEAD_LENGTH ? `${text.slice(0, NOTICE_HEAD_LENGTH)}…` : text;
      return `- ${formatLlmDateTime(notice.created_at)}: ${head}`;
    });
    return `Already posted to the company team about introduction ${root}${total > shown.length ? ` (latest ${shown.length} of ${total})` : ""}, oldest first, beginnings only:\n${lines.join("\n")}`;
  });
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
