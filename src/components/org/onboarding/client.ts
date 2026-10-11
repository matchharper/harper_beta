import { fetchWithInternalAuth } from "@/lib/internalApiClient";

export type OrgOnboardingCompanyStatus =
  | { ok: true; status: "missing" | "pending" | "failed" }
  | { ok: true; status: "completed"; reply: string };

export class OrgOnboardingResultUnconfirmedError extends Error {
  constructor() {
    super("Company onboarding result is not yet confirmed");
  }
}

export function getOrgOnboardingCompanyStatus(
  workspaceId: string,
  submissionId: string
) {
  const params = new URLSearchParams({ workspaceId, submissionId });
  return fetchWithInternalAuth<OrgOnboardingCompanyStatus>(
    `/api/org/onboarding?${params.toString()}`
  );
}

export function postOrgOnboarding<T>(
  workspaceId: string,
  body: Record<string, unknown>
) {
  return fetchWithInternalAuth<T>("/api/org/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, workspaceId }),
  });
}

export async function submitOrgOnboardingCompany(
  args: {
    message: string;
    responseLocale: string;
    submissionId: string;
    workspaceId: string;
  },
  transport: {
    getStatus: typeof getOrgOnboardingCompanyStatus;
    post: (
      workspaceId: string,
      body: Record<string, unknown>
    ) => Promise<OrgOnboardingCompanyStatus>;
    wait: (ms: number) => Promise<void>;
    now: () => number;
  } = {
    getStatus: getOrgOnboardingCompanyStatus,
    post: postOrgOnboarding,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: Date.now,
  }
): Promise<string> {
  let result: OrgOnboardingCompanyStatus | null = null;
  try {
    result = await transport.post(args.workspaceId, {
      action: "company",
      message: args.message,
      responseLocale: args.responseLocale,
      submissionId: args.submissionId,
    });
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status && status < 500) throw error;
    // The original request may have committed before its response was lost.
  }
  if (result?.status === "completed") return result.reply;
  if (result && "reply" in result && typeof result.reply === "string") {
    return result.reply;
  }
  if (result?.status === "failed") {
    throw new OrgOnboardingResultUnconfirmedError();
  }

  const startedAt = transport.now();
  const deadline = startedAt + 90_000;
  let seenPending = result?.status === "pending";
  do {
    try {
      const status = await transport.getStatus(
        args.workspaceId,
        args.submissionId
      );
      if (status.status === "completed") return status.reply;
      if (status.status === "failed") {
        throw new OrgOnboardingResultUnconfirmedError();
      }
      if (status.status === "pending") seenPending = true;
      if (
        status.status === "missing" &&
        !seenPending &&
        transport.now() - startedAt >= 8_000
      ) {
        throw new OrgOnboardingResultUnconfirmedError();
      }
    } catch (error) {
      if (error instanceof OrgOnboardingResultUnconfirmedError) throw error;
      const status = (error as { status?: number }).status;
      if (status && status < 500) throw error;
    }
    if (transport.now() >= deadline) break;
    await transport.wait(1_500);
  } while (transport.now() < deadline);
  throw new OrgOnboardingResultUnconfirmedError();
}
