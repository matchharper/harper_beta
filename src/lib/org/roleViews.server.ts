import "server-only";

import type { User } from "@supabase/supabase-js";
import { assertOrgRoleAccess, OrgHttpError } from "@/lib/org/server";
import {
  normalizeOrgBoardLayout,
  normalizeOrgListColumnValues,
  type OrgBoardLayout,
  type OrgRoleListColumn,
} from "@/lib/org/roleViews";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

type ColumnRow = {
  description: string | null;
  id: string;
  label: string;
  updated_at: string;
  values: unknown;
};

const columnsTable = () =>
  getSupabaseAdmin().from("company_role_list_columns" as any) as any;
const layoutsTable = () =>
  getSupabaseAdmin().from("company_role_board_layouts" as any) as any;

function toColumn(row: ColumnRow): OrgRoleListColumn {
  return {
    description: row.description,
    id: row.id,
    label: row.label,
    updatedAt: row.updated_at,
    values: normalizeOrgListColumnValues(row.values),
  };
}

async function readColumns(workspaceId: string, roleId: string) {
  const { data, error } = await columnsTable()
    .select("id, label, description, values, updated_at")
    .eq("company_workspace_id", workspaceId)
    .eq("role_id", roleId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as ColumnRow[]).map(toColumn);
}

export async function listOrgRoleListColumns(args: {
  roleId: string;
  user: User;
  workspaceId: string;
}) {
  await assertOrgRoleAccess({
    admin: getSupabaseAdmin(),
    permission: "view",
    roleId: args.roleId,
    user: args.user,
    workspaceId: args.workspaceId,
  });
  return readColumns(args.workspaceId, args.roleId);
}

export type OrgListColumnChange =
  | {
      action: "add";
      description?: string | null;
      label: string;
      values: Record<string, string>;
    }
  | {
      action: "update";
      columnId: string;
      description?: string | null;
      label?: string | null;
      /** Merged by talent ID; an empty text clears that cell. */
      values?: Record<string, string>;
    }
  | { action: "remove"; columnId: string };

/**
 * Applies one column change for a Role the caller already resolved as
 * accessible (the agent executor's Role, or a route that checked access).
 */
export async function changeOrgRoleListColumns(args: {
  change: OrgListColumnChange;
  roleId: string;
  userId: string;
  workspaceId: string;
}) {
  const { change } = args;
  const now = new Date().toISOString();
  let changed: OrgRoleListColumn | null = null;
  if (change.action === "add") {
    const { data, error } = await columnsTable()
      .insert({
        company_workspace_id: args.workspaceId,
        created_by: args.userId,
        description: change.description ?? null,
        label: change.label,
        role_id: args.roleId,
        updated_by: args.userId,
        values: normalizeOrgListColumnValues(change.values),
      })
      .select("id, label, description, values, updated_at")
      .single();
    if (error) throw error;
    changed = toColumn(data as ColumnRow);
  } else {
    const { data: current, error: readError } = await columnsTable()
      .select("id, label, description, values, updated_at")
      .eq("company_workspace_id", args.workspaceId)
      .eq("role_id", args.roleId)
      .eq("id", change.columnId)
      .maybeSingle();
    if (readError) throw readError;
    if (!current) throw new OrgHttpError(404, "비교 열을 찾을 수 없어요.");
    if (change.action === "remove") {
      const { error } = await columnsTable()
        .delete()
        .eq("id", change.columnId)
        .eq("role_id", args.roleId);
      if (error) throw error;
      changed = toColumn(current as ColumnRow);
    } else {
      const values = normalizeOrgListColumnValues(
        (current as ColumnRow).values
      );
      for (const [talentId, text] of Object.entries(change.values ?? {})) {
        if (text.trim()) values[talentId] = text;
        else delete values[talentId];
      }
      const { data, error } = await columnsTable()
        .update({
          ...(change.label ? { label: change.label } : {}),
          ...(change.description !== undefined
            ? { description: change.description }
            : {}),
          updated_at: now,
          updated_by: args.userId,
          values,
        })
        .eq("id", change.columnId)
        .eq("role_id", args.roleId)
        .select("id, label, description, values, updated_at")
        .single();
      if (error) throw error;
      changed = toColumn(data as ColumnRow);
    }
  }
  return {
    changed,
    columns: await readColumns(args.workspaceId, args.roleId),
  };
}

export async function removeOrgRoleListColumn(args: {
  columnId: string;
  roleId: string;
  user: User;
  workspaceId: string;
}) {
  await assertOrgRoleAccess({
    admin: getSupabaseAdmin(),
    permission: "manage_candidates",
    roleId: args.roleId,
    user: args.user,
    workspaceId: args.workspaceId,
  });
  return changeOrgRoleListColumns({
    change: { action: "remove", columnId: args.columnId },
    roleId: args.roleId,
    userId: args.user.id,
    workspaceId: args.workspaceId,
  });
}

export async function getOrgBoardLayout(args: {
  roleId: string;
  user: User;
  workspaceId: string;
}): Promise<OrgBoardLayout> {
  await assertOrgRoleAccess({
    admin: getSupabaseAdmin(),
    permission: "view",
    roleId: args.roleId,
    user: args.user,
    workspaceId: args.workspaceId,
  });
  const { data, error } = await layoutsTable()
    .select("positions, viewport")
    .eq("role_id", args.roleId)
    .eq("company_user_id", args.user.id)
    .maybeSingle();
  if (error) throw error;
  return normalizeOrgBoardLayout(data);
}

export async function saveOrgBoardLayout(args: {
  layout: unknown;
  roleId: string;
  user: User;
  workspaceId: string;
}) {
  await assertOrgRoleAccess({
    admin: getSupabaseAdmin(),
    permission: "view",
    roleId: args.roleId,
    user: args.user,
    workspaceId: args.workspaceId,
  });
  const layout = normalizeOrgBoardLayout(args.layout);
  const { error } = await layoutsTable().upsert(
    {
      company_user_id: args.user.id,
      company_workspace_id: args.workspaceId,
      positions: layout.positions,
      role_id: args.roleId,
      updated_at: new Date().toISOString(),
      viewport: layout.viewport,
    },
    { onConflict: "role_id,company_user_id" }
  );
  if (error) throw error;
  return layout;
}
