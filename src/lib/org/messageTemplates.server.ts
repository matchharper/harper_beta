import "server-only";

import type { User } from "@supabase/supabase-js";
import { assertOrgWorkspacePermission, OrgHttpError } from "@/lib/org/server";
import {
  findUnknownOrgIntroFields,
  normalizeOrgMessageTemplateContent,
  ORG_INTRO_UNKNOWN_FIELD_ERROR,
  ORG_MESSAGE_TEMPLATE_KINDS,
  ORG_MESSAGE_TEMPLATE_LIMIT,
  type OrgMessageTemplate,
  type OrgMessageTemplateContent,
  type OrgMessageTemplateKind,
} from "@/lib/org/messageTemplates";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

type TemplateRow = {
  content: unknown;
  id: string;
  kind: string;
  name: string;
};

function templateKind(value: unknown): OrgMessageTemplateKind {
  const kind = String(value ?? "");
  if (!(ORG_MESSAGE_TEMPLATE_KINDS as readonly string[]).includes(kind)) {
    throw new OrgHttpError(400, "템플릿 종류를 확인해 주세요.");
  }
  return kind as OrgMessageTemplateKind;
}

const table = () =>
  getSupabaseAdmin().from("company_message_templates" as any) as any;

function toTemplate(row: TemplateRow): OrgMessageTemplate | null {
  const kind = templateKind(row.kind);
  const content = normalizeOrgMessageTemplateContent(kind, row.content);
  return content ? { content, id: row.id, kind, name: row.name } : null;
}

export async function listOrgMessageTemplates(args: {
  kind: unknown;
  user: User;
  workspaceId: string;
}) {
  const kind = templateKind(args.kind);
  await assertOrgWorkspacePermission({
    admin: getSupabaseAdmin(),
    permission: "view",
    user: args.user,
    workspaceId: args.workspaceId,
  });
  const { data, error } = await table()
    .select("id, kind, name, content")
    .eq("company_workspace_id", args.workspaceId)
    .eq("kind", kind)
    .order("created_at", { ascending: true })
    .limit(ORG_MESSAGE_TEMPLATE_LIMIT);
  if (error) throw error;
  return ((data ?? []) as TemplateRow[]).flatMap(
    (row) => toTemplate(row) ?? []
  );
}

export async function saveOrgMessageTemplate(args: {
  content: unknown;
  id?: string | null;
  kind: unknown;
  name: unknown;
  user: User;
  workspaceId: string;
}) {
  const kind = templateKind(args.kind);
  await assertOrgWorkspacePermission({
    admin: getSupabaseAdmin(),
    permission: "manage_candidates",
    user: args.user,
    workspaceId: args.workspaceId,
  });
  const content = normalizeOrgMessageTemplateContent(kind, args.content);
  const name = String(args.name ?? "")
    .trim()
    .slice(0, 60);
  if (!content || !name) {
    throw new OrgHttpError(400, "템플릿에 넣을 내용을 먼저 써 주세요.");
  }
  if (kind === "intro_email") {
    const { body, subject } =
      content as OrgMessageTemplateContent["intro_email"];
    const unknown = findUnknownOrgIntroFields(subject, body);
    if (unknown.length) {
      // A mistyped value would be sent to candidates as written.
      throw new OrgHttpError(400, ORG_INTRO_UNKNOWN_FIELD_ERROR);
    }
  }
  const now = new Date().toISOString();
  if (args.id) {
    const { data, error } = await table()
      .update({ content, name, updated_at: now, updated_by: args.user.id })
      .eq("id", args.id)
      .eq("company_workspace_id", args.workspaceId)
      .eq("kind", kind)
      .select("id, kind, name, content")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new OrgHttpError(404, "템플릿을 찾지 못했어요.");
    return toTemplate(data as TemplateRow)!;
  }
  const { count, error: countError } = await table()
    .select("id", { count: "exact", head: true })
    .eq("company_workspace_id", args.workspaceId)
    .eq("kind", kind);
  if (countError) throw countError;
  if ((count ?? 0) >= ORG_MESSAGE_TEMPLATE_LIMIT) {
    throw new OrgHttpError(
      409,
      `템플릿은 ${ORG_MESSAGE_TEMPLATE_LIMIT}개까지 저장할 수 있어요. 하나를 지운 뒤 추가해 주세요.`
    );
  }
  const { data, error } = await table()
    .insert({
      company_workspace_id: args.workspaceId,
      content,
      created_by: args.user.id,
      kind,
      name,
      updated_by: args.user.id,
    })
    .select("id, kind, name, content")
    .single();
  if (error) throw error;
  return toTemplate(data as TemplateRow)!;
}

export async function deleteOrgMessageTemplate(args: {
  id: string;
  user: User;
  workspaceId: string;
}) {
  await assertOrgWorkspacePermission({
    admin: getSupabaseAdmin(),
    permission: "manage_candidates",
    user: args.user,
    workspaceId: args.workspaceId,
  });
  const { error } = await table()
    .delete()
    .eq("id", args.id)
    .eq("company_workspace_id", args.workspaceId);
  if (error) throw error;
}
