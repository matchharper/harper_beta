import "server-only";

import { candidateContactBodyWithoutTransportFooter } from "@/lib/companyTalentRequests/presentation";
import type {
  CareerRecentInfoCursor,
  CareerRecentInfoItem,
  CareerRecentInfoPage,
} from "./taskItems";

type Admin = { rpc: any };

type RecentInfoRow = {
  event_id: string;
  kind: CareerRecentInfoItem["kind"];
  occurred_at: string;
  role_id: string;
  company_name: string;
  role_name: string;
  body: string | null;
};

async function queryRecentInfo(args: {
  admin: Admin;
  talentId: string;
  before?: CareerRecentInfoCursor;
  since?: string;
  limit: number;
}): Promise<RecentInfoRow[]> {
  const { data, error } = await args.admin.rpc("fetch_career_recent_info_v1", {
    p_talent_id: args.talentId,
    p_before_at: args.before?.at ?? null,
    p_before_id: args.before?.id ?? null,
    p_since: args.since ?? null,
    p_limit: args.limit,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

function toItem(row: RecentInfoRow): CareerRecentInfoItem {
  return {
    id: row.event_id,
    kind: row.kind,
    occurredAt: row.occurred_at,
    roleId: row.role_id,
    companyName: row.company_name,
    roleName: row.role_name,
    body:
      row.kind === "company_deliver"
        ? candidateContactBodyWithoutTransportFooter(row.body).slice(0, 1200)
        : null,
  };
}

export async function fetchCareerRecentInfoPage(args: {
  admin: Admin;
  talentId: string;
  before?: CareerRecentInfoCursor;
}): Promise<CareerRecentInfoPage> {
  const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const firstPage = !args.before;
  const rows = await queryRecentInfo({
    admin: args.admin,
    talentId: args.talentId,
    before: args.before,
    since: firstPage ? weekStart : undefined,
    limit: firstPage ? 201 : 11,
  });
  const pageSize = firstPage ? 200 : 10;
  const visible = rows.slice(0, pageSize);
  let nextCursor: CareerRecentInfoCursor | null = null;
  if (rows.length > pageSize && visible.length) {
    const last = visible[visible.length - 1];
    nextCursor = { at: last.occurred_at, id: last.event_id };
  } else if (firstPage) {
    // The first view is the entire recent week. Older history starts at the
    // week boundary even when there are no events in that week.
    const older = await queryRecentInfo({
      admin: args.admin,
      talentId: args.talentId,
      before: { at: weekStart, id: "" },
      limit: 1,
    });
    if (older.length) nextCursor = { at: weekStart, id: "" };
  }
  return { items: visible.map(toItem), nextCursor };
}
