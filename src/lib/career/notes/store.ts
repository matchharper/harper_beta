import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

type Row = Record<string, any>;
const db = (admin: TalentAdminClient, table: string) => admin.from(table as never) as any;

export type NoteKind = "think" | "work";
export type NoteSummary = {
  id: string;
  kind: NoteKind;
  title: string;
  matchingId: string | null;
  matchingTitle: string | null;
  companyWorkspaceId: string | null;
  companyName: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
export type Note = NoteSummary & { content: string };

/** How many notes the base context lists by last edit (docs/career-agent-harness-ko.md 4.1). */
export const NOTE_LIST_SIZE = 10;
const SUMMARY_COLUMNS = "id,kind,title,matching_id,company_workspace_id,revision,created_at,updated_at";

async function labels(admin: TalentAdminClient, rows: Row[]) {
  const matchingIds = [...new Set(rows.flatMap(r => r.matching_id ? [r.matching_id] : []))];
  const companyIds = [...new Set(rows.flatMap(r => r.company_workspace_id ? [r.company_workspace_id] : []))];
  const [matchings, companies] = await Promise.all([
    matchingIds.length ? db(admin, "talent_matchings").select("id,title").in("id", matchingIds) : { data: [] },
    companyIds.length ? db(admin, "company_workspace").select("company_workspace_id,company_name").in("company_workspace_id", companyIds) : { data: [] },
  ]);
  return {
    matching: new Map<string, string>((matchings.data ?? []).map((r: Row) => [r.id, r.title])),
    company: new Map<string, string>((companies.data ?? []).map((r: Row) => [r.company_workspace_id, r.company_name])),
  };
}

function toSummary(row: Row, names: Awaited<ReturnType<typeof labels>>): NoteSummary {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    matchingId: row.matching_id ?? null,
    matchingTitle: row.matching_id ? names.matching.get(row.matching_id) ?? null : null,
    companyWorkspaceId: row.company_workspace_id ?? null,
    companyName: row.company_workspace_id ? names.company.get(row.company_workspace_id) ?? null : null,
    revision: Number(row.revision),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Notes by last edit. Filters narrow the list; the total counts what the filters match. */
export async function listNotes(admin: TalentAdminClient, args: {
  userId: string; limit?: number; cursor?: string | null;
  matchingId?: string; companyWorkspaceId?: string; kind?: NoteKind; query?: string;
}) {
  const offset = Math.max(0, Number.parseInt(args.cursor ?? "0", 10) || 0);
  const limit = Math.min(Math.max(args.limit ?? NOTE_LIST_SIZE, 1), 50);
  let query = db(admin, "talent_notes").select(SUMMARY_COLUMNS, { count: "exact" }).eq("talent_id", args.userId);
  if (args.matchingId) query = query.eq("matching_id", args.matchingId);
  if (args.companyWorkspaceId) query = query.eq("company_workspace_id", args.companyWorkspaceId);
  if (args.kind) query = query.eq("kind", args.kind);
  const words = args.query?.trim();
  if (words) {
    const pattern = `%${words.replace(/[%_,()]/g, " ")}%`;
    query = query.or(`title.ilike.${pattern},content.ilike.${pattern}`);
  }
  const { data, error, count } = await query.order("updated_at", { ascending: false }).order("id")
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  const rows: Row[] = data ?? [];
  const names = await labels(admin, rows);
  const total = count ?? rows.length;
  return {
    notes: rows.map(row => toSummary(row, names)),
    total,
    nextCursor: offset + rows.length < total ? String(offset + rows.length) : null,
  };
}

export async function readNote(admin: TalentAdminClient, args: { userId: string; noteId: string }): Promise<Note> {
  const { data, error } = await db(admin, "talent_notes").select(`${SUMMARY_COLUMNS},content`)
    .eq("talent_id", args.userId).eq("id", args.noteId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Note ${args.noteId} is unavailable.`);
  const names = await labels(admin, [data]);
  return { ...toSummary(data, names), content: data.content ?? "" };
}

/** The work notes of one matching, latest first; the latest carries its content. */
export async function readMatchingWorkNotes(admin: TalentAdminClient, args: { userId: string; matchingId: string }) {
  const { data, error } = await db(admin, "talent_notes").select(`${SUMMARY_COLUMNS},content`)
    .eq("talent_id", args.userId).eq("matching_id", args.matchingId).eq("kind", "work")
    .order("updated_at", { ascending: false }).order("id").limit(20);
  if (error) throw new Error(error.message);
  const rows: Row[] = data ?? [];
  const names = await labels(admin, rows);
  const [latest, ...others] = rows;
  return {
    latest: latest ? { ...toSummary(latest, names), content: latest.content ?? "" } : null,
    others: others.map(row => toSummary(row, names)),
  };
}

export type NoteWrite = {
  action: "create" | "update" | "delete";
  noteId?: string;
  expectedRevision?: number;
  kind?: NoteKind;
  title?: string;
  content?: string;
  append?: string;
  replace?: { old: string; new: string };
  matchingId?: string;
  companyWorkspaceId?: string;
  sourceRefs?: Row[];
};

export async function writeNote(admin: TalentAdminClient, userId: string, input: NoteWrite) {
  const { data, error } = await admin.rpc("write_career_note_v1" as never, {
    p_talent: userId,
    p_note: input.noteId ?? null,
    p_action: input.action,
    p_expected_revision: input.expectedRevision ?? null,
    p_kind: input.kind ?? null,
    p_title: input.title ?? null,
    p_content: input.content ?? null,
    p_append: input.append ?? null,
    p_replace_old: input.replace?.old ?? null,
    p_replace_new: input.replace ? input.replace.new ?? "" : null,
    p_matching: input.matchingId ?? null,
    p_company: input.companyWorkspaceId ?? null,
    p_source_refs: input.sourceRefs ?? [],
  } as never);
  if (error) throw new Error(error.message);
  const row = data as Row;
  if (row?.deleted) return { deleted: true as const, id: String(row.id) };
  const names = await labels(admin, [row]);
  return { deleted: false as const, note: { ...toSummary(row, names), content: row.content ?? "" } };
}

/**
 * Gmail mailbox generations searched in this conversation. A note written there
 * may carry what was read, so disconnecting that mailbox removes the note.
 */
export async function conversationMailSources(admin: TalentAdminClient, args: { userId: string; conversationId?: string | null }) {
  if (!args.conversationId) return [];
  const { data, error } = await db(admin, "talent_external_operations").select("request")
    .eq("user_id", args.userId).eq("conversation_id", args.conversationId).eq("kind", "resource_search")
    .not("request->>mailboxGeneration", "is", null).limit(50);
  if (error) throw new Error(error.message);
  const generations = new Set<string>((data ?? []).flatMap((r: Row) => r.request?.mailboxGeneration ? [String(r.request.mailboxGeneration)] : []));
  return [...generations].map(generation => ({ type: "gmail", generation }));
}
