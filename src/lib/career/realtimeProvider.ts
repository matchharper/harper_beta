export type CareerRealtimeProvider = "openai" | "xai";

type CareerRealtimeProviderAssignment = {
  providerOverride?: string | null;
  userCreatedAt?: string | null;
  userId: string;
};

export function resolveCareerRealtimeProvider(
  assignment: CareerRealtimeProviderAssignment
): CareerRealtimeProvider {
  // Normal traffic always uses OpenAI. A provider override is accepted only
  // when an authorized caller has already validated and forwarded it.
  const providerOverride = assignment.providerOverride?.trim().toLowerCase();
  if (providerOverride === "openai" || providerOverride === "xai") {
    return providerOverride;
  }

  return "openai";
}
