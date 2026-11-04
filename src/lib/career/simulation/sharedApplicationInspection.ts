import { createHash } from "node:crypto";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { applicationFormSchema, applicationLimitations, type ApplicationForm } from "./applicationForm";
import type { SimulationSession } from "./session";

type ObjectValue = Record<string, any>;
export type SharedInspection = { id: string; role_ref: string; checked_at: string; payload: ApplicationForm };

function object(value: unknown): ObjectValue | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : undefined;
}

// Only public inspection containers are visited. Answers, documents, approvals,
// browser input/receipts and previous submission attempts stay in the activity.
function formSlots(payload: ObjectValue) {
  const slots = [{ owner: payload, field: "applicationForm", ref: "applicationFormId" }];
  const reviews = [payload.applicationReview, payload.browser?.reviewedApplication,
    ...(payload.browser?.previousAttempts ?? []).map((attempt: ObjectValue) => attempt.reviewedApplication)];
  for (const review of reviews) if (object(review)) slots.push({ owner: review, field: "form", ref: "formId" });
  return slots;
}

export function inspectionRoleRef(payload: ObjectValue): string {
  return payload.activity?.roleId ? `role:${payload.activity.roleId}` : payload.roleRef;
}

/** Stable identity makes activity-save retries reuse the same public observation. */
function inspectionId(roleRef: string, form: ApplicationForm) {
  const hex = createHash("sha256").update(JSON.stringify([roleRef, form])).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function splitApplicationInspections(state: SimulationSession) {
  const payload: ObjectValue = structuredClone(state);
  const roleRef = inspectionRoleRef(payload);
  const rows = new Map<string, SharedInspection>();
  for (const slot of formSlots(payload)) {
    if (!slot.owner[slot.field]) continue;
    // Explicit projection excludes user answers or unrelated provider metadata.
    const parsed = applicationFormSchema.parse(slot.owner[slot.field]);
    const form: ApplicationForm = {
      ...parsed,
      limitations: applicationLimitations(parsed),
      ...(parsed.submission ? { submission: { status: parsed.submission.status } } : {}),
    };
    // Existing references pin the originally observed form, including in approval history.
    const id = slot.owner[slot.ref] ?? inspectionId(roleRef, form);
    if (!slot.owner[slot.ref]) rows.set(id, { id, role_ref: roleRef, checked_at: form.checkedAt, payload: form });
    slot.owner[slot.ref] = id;
    delete slot.owner[slot.field];
  }
  if (payload.applicationFormId) delete payload.applicationUrl;
  return { payload, rows: [...rows.values()] };
}

export async function storeApplicationInspections(admin: TalentAdminClient, state: SimulationSession) {
  const { payload, rows } = splitApplicationInspections(state);
  if (rows.length) {
    const { error } = await admin
      .from("role_application_inspections").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new Error("Application inspection could not be saved", { cause: error });
  }
  return payload;
}

export async function hydrateApplicationInspections(admin: TalentAdminClient, value: unknown): Promise<unknown> {
  const original = object(value);
  if (!original) return value;
  const payload = structuredClone(original);
  const slots = formSlots(payload).filter(slot => slot.owner[slot.ref]);
  if (!slots.length) return payload; // Existing activities remain readable before their next save.
  const ids = [...new Set(slots.map(slot => slot.owner[slot.ref] as string))];
  const { data, error } = await admin
    .from("role_application_inspections").select("id,payload")
    .eq("role_ref", inspectionRoleRef(payload)).in("id", ids);
  if (error) throw new Error("Application inspection unavailable", { cause: error });
  const forms = new Map((data ?? []).map(row => [row.id, applicationFormSchema.parse(row.payload)]));
  for (const slot of slots) {
    const form = forms.get(slot.owner[slot.ref]);
    if (!form) throw new Error("Referenced application inspection unavailable");
    slot.owner[slot.field] = structuredClone(form);
  }
  if (payload.applicationForm) payload.applicationUrl = payload.applicationForm.url;
  return payload;
}
