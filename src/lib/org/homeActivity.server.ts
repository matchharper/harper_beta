import { loadActivityEvents } from "./homeActivitySource.server";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import {
  fetchOrgBoard,
  fetchRoleRowsForWorkspace,
  OrgHttpError,
  type OrgBoardItem,
} from "./server";
import type {
  OrgHomeActivity,
  OrgHomeActivityFilter,
  OrgHomeActivityPage,
} from "./homeActivity";
import {
  activityTimestamp,
  compareActivity,
  readActivityPage,
  type ActivityPosition,
} from "./homeActivityPagination";

type Admin = ReturnType<typeof getSupabaseAdmin>;
const positionSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  id: z
    .string()
    .regex(
      /^(?:(?:intro-sent|intro-accepted|meeting-confirmed|meeting-requested):)?[0-9a-f-]{36}$/
    ),
});
const cursorSchema = z.object({
  version: z.literal(1),
  scope: z.string(),
  snapshot: z.string().datetime({ offset: true }),
  after: positionSchema,
});

export async function fetchOrgHomeActivityPage(args: {
  admin?: Admin;
  user: User;
  workspaceId: string;
  roleId?: string;
  cursor?: string;
  search: string;
  kind: OrgHomeActivityFilter;
  locale: "ko" | "en";
}): Promise<OrgHomeActivityPage> {
  const admin = args.admin ?? getSupabaseAdmin();
  const scope = createHash("sha256")
    .update(
      JSON.stringify([
        args.workspaceId,
        args.roleId ?? null,
        args.search,
        args.kind,
        args.locale,
      ])
    )
    .digest("hex");
  let after: ActivityPosition | null = null;
  let snapshot = activityTimestamp(new Date().toISOString());
  if (args.cursor) {
    try {
      const cursor = cursorSchema.parse(
        JSON.parse(Buffer.from(args.cursor, "base64url").toString())
      );
      if (
        cursor.scope !== scope ||
        Date.parse(cursor.snapshot) > Date.now() ||
        compareActivity(cursor.after, { createdAt: cursor.snapshot, id: "" }) <
          0
      )
        throw new Error("Cursor scope or time mismatch");
      after = {
        ...cursor.after,
        createdAt: activityTimestamp(cursor.after.createdAt),
      };
      snapshot = activityTimestamp(cursor.snapshot);
    } catch {
      throw new OrgHttpError(400, "Invalid activity cursor");
    }
  }
  // Re-read permissions on every page. Never trust role or candidate IDs from a cursor.
  const roles = await fetchRoleRowsForWorkspace(
    admin,
    args.workspaceId,
    args.user
  );
  if (args.roleId && !roles.some((role) => role.role_id === args.roleId))
    throw new OrgHttpError(404, "Role not found");
  const roleIds = args.roleId
    ? [args.roleId]
    : roles.map((role) => role.role_id);
  if (!roleIds.length) return { items: [], nextCursor: null };
  const candidates = new Map<string, OrgBoardItem | null>();
  const result = await readActivityPage({
    after,
    search: args.search,
    kind: args.kind,
    locale: args.locale,
    load: (position) =>
      loadActivityEvents({
        admin,
        workspaceId: args.workspaceId,
        roleIds,
        snapshot,
        after: position,
        kind: args.kind,
      }),
    project: async (events) => {
      const missing = new Map<string, Set<string>>();
      for (const item of events) {
        const key = `${item.roleId}:${item.talentId}`;
        if (candidates.has(key)) continue;
        candidates.set(key, null);
        const ids = missing.get(item.roleId) ?? new Set<string>();
        ids.add(item.talentId);
        missing.set(item.roleId, ids);
      }
      // Reuse general visibility/projection (team, test-only, stage and profile access).
      // Scope before its board limit, so old candidates are not lost to the global cap.
      const groups = [...missing];
      for (let index = 0; index < groups.length; index += 4) {
        await Promise.all(
          groups.slice(index, index + 4).map(async ([roleId, talentIds]) => {
            const board = await fetchOrgBoard({
              admin,
              user: args.user,
              workspaceId: args.workspaceId,
              roleId,
              talentIds: [...talentIds],
              includeProfileLabels: false,
              includeInternalStages: false,
            });
            for (const item of board.items) {
              candidates.set(`${item.roleId}:${item.talentId}`, item);
            }
          })
        );
      }
      const projected = new Map<string, OrgHomeActivity>();
      for (const item of events) {
        const candidate = candidates.get(`${item.roleId}:${item.talentId}`);
        if (candidate)
          projected.set(item.id, {
            ...item,
            roleName: candidate.roleName ?? "",
            talentName: candidate.talent.name ?? "",
            recommendationId: candidate.recommendationId,
          });
      }
      return projected;
    },
  });
  return {
    items: result.items,
    nextCursor: result.after
      ? Buffer.from(
          JSON.stringify({
            version: 1,
            scope,
            snapshot,
            after: result.after,
          })
        ).toString("base64url")
      : null,
  };
}
