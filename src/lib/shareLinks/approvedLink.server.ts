import type { z } from "zod";
import { parseCareerFormResponse, parseCareerForm, type CareerForm, type CareerFormResponse } from "@/lib/career/forms/schema";
import type { ExternalToolContext } from "@/lib/career/externalOperations/store";
import type { browserProfileLinkSchema } from "./browserParam";
import { PROFILE_LINK_BOX_LABEL } from "./formGuard";

type ProfileLink = z.infer<typeof browserProfileLinkSchema>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The 'Harper 후보 요약 링크 넣기' box on a reviewed application form (the code-added or Harper-written one). */
export function profileLinkItem(form: Pick<CareerForm, "items">) {
  return form.items.find((item) => item.type === "checkbox" && (item.id.startsWith("harper_candidate_link")
    || item.label.includes(PROFILE_LINK_BOX_LABEL) || item.label.includes("후보 요약 링크") || /candidate summary link/i.test(item.label)));
}

const formRoles = (form: Pick<CareerForm, "relatedRefs">) =>
  (form.relatedRefs ?? []).filter((ref) => ref.type === "role").map((ref) => String(ref.id));

/** Form responses carried by the approving messages (one response, or a batch of them). */
export function responsesIn(payload: unknown): CareerFormResponse[] {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const nested = ["responses", "formResponses"].flatMap((key) => Array.isArray(record[key]) ? record[key] as unknown[] : []);
  return [payload, ...nested].flatMap((value) => {
    const response = parseCareerFormResponse(value);
    return response ? [response] : [];
  });
}

/**
 * Whether the person keeps the box checked for this application: their answer on the form that approved it, else the
 * box as the newest review form for the role holds it (its last answer, or its initial value when they approved in
 * chat without answering the form). null when no reviewed form for these roles has the box.
 */
export async function approvedProfileLinkChoice(context: Pick<ExternalToolContext, "admin" | "userId" | "conversationId">,
  args: { roleRefs: string[]; authorization: { payload: unknown }[] }): Promise<{ include: boolean; roleId: string } | null> {
  const roles = args.roleRefs.filter((id) => UUID.test(id));
  if (!roles.length) return null;
  for (const message of args.authorization)
    for (const response of responsesIn(message.payload)) {
      const item = profileLinkItem(response.formSnapshot);
      const roleId = formRoles(response.formSnapshot).find((id) => roles.includes(id));
      if (item && roleId) return { include: response.values[item.id] === true, roleId };
    }
  for (const roleId of roles) {
    const { data, error } = await (context.admin.from("talent_messages") as any).select("id,payload")
      .eq("user_id", context.userId).eq("conversation_id", context.conversationId).eq("message_type", "career_form")
      .contains("payload", { relatedRefs: [{ type: "role", id: roleId }] }).order("id", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    const form = parseCareerForm(data?.payload);
    const item = form && profileLinkItem(form);
    if (!form || !item) continue;
    const answered = await (context.admin.from("talent_messages") as any).select("payload")
      .eq("user_id", context.userId).eq("conversation_id", context.conversationId).eq("message_type", "career_form_response")
      .contains("payload", { formId: form.formId }).order("id", { ascending: false }).limit(5);
    if (answered.error) throw new Error(answered.error.message);
    const last = ((answered.data ?? []) as { payload: unknown }[]).flatMap((row) => responsesIn(row.payload))
      .find((response) => response.formId === form.formId && response.revision === form.revision && item.id in response.values);
    const initial = typeof item.content === "object" && item.content.value === true;
    return { include: last ? last.values[item.id] === true : initial, roleId };
  }
  return null;
}

/** The company and posting of a role, as the candidate summary link names them. */
export async function roleProfileLink(context: Pick<ExternalToolContext, "admin">, roleId: string): Promise<ProfileLink | null> {
  const { data, error } = await (context.admin.from("company_roles") as any)
    .select("name,external_jd_url,company_workspace:company_workspace_id(company_name)").eq("role_id", roleId).maybeSingle();
  if (error) throw new Error(error.message);
  const company = String(data?.company_workspace?.company_name ?? "").trim();
  const title = String(data?.name ?? "").trim();
  if (!company || !title) return null;
  return { company_name: company.slice(0, 160), posting_title: title.slice(0, 200), posting_url: data.external_jd_url ?? null };
}
