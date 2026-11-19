import { browserUseAgents } from "../simulation/browserUseAgents";
import {
  createOperation,
  operationSchema,
  updateOperation,
  type ExternalOperation,
  type ExternalToolContext,
} from "../externalOperations/store";

/**
 * Saved login: with the candidate's agreement, one Browser Use profile per candidate keeps the sign-in state
 * (cookies) of the sites they logged into in Harper's browser, so a later application on the same site starts
 * signed in. Harper never asks for, sees or stores a password. The row is the consent record; forgetting deletes
 * the provider profile.
 */
const KIND = "browser_profile";
const KEY = "saved-login";

export const savedLoginProfileId = (row: ExternalOperation | null) =>
  row?.status === "active" && typeof row.provider_refs.profile_id === "string" ? row.provider_refs.profile_id : null;

export async function readSavedLogin(context: Pick<ExternalToolContext, "admin" | "userId">) {
  const { data, error } = await (context.admin.from as any)("talent_external_operations").select("*")
    .eq("user_id", context.userId).eq("kind", KIND).eq("idempotency_key", KEY).maybeSingle();
  if (error) throw new Error("Saved login unavailable");
  return data ? operationSchema.parse(data) : null;
}

export async function enableSavedLogin(context: ExternalToolContext) {
  let row = await createOperation(context, { kind: KIND, idempotencyKey: KEY, request: {} });
  if (savedLoginProfileId(row)) return row;
  // Claim the row first, so two agreements at once never create two provider profiles.
  row = await updateOperation(context, row, { status: "preparing" });
  let profileId: string | undefined;
  try {
    profileId = await browserUseAgents.createProfile(context.userId);
    return await updateOperation(context, row, { status: "active", provider_refs: { profile_id: profileId },
      result: { consent_message_id: context.userMessageId ?? null, enabled_at: new Date().toISOString() } });
  } catch (error) {
    if (profileId) await browserUseAgents.deleteProfile(profileId).catch(() => undefined);
    await updateOperation(context, row, { status: "closed" }).catch(() => undefined);
    throw error;
  }
}

/** Deletes the provider profile, so no later browser starts signed in. Also runs on account deletion. */
export async function forgetSavedLogin(context: Pick<ExternalToolContext, "admin" | "userId">) {
  const row = await readSavedLogin(context);
  const profileId = savedLoginProfileId(row);
  if (!row || !profileId) return row;
  await browserUseAgents.deleteProfile(profileId);
  return updateOperation(context, row, { status: "closed", provider_refs: {},
    result: { ...row.result, forgotten_at: new Date().toISOString() } });
}
