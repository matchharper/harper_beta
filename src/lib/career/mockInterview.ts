import { fetchTalentOpportunityHistoryByIds } from "@/lib/talentOpportunity";
import type { MockInterviewContext } from "./prompts/cases/mockInterviewPrompts";

export class MockInterviewRequestError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

export function readMockInterviewOpportunityId(body: {
  mockInterviewOpportunityId?: unknown;
  conversationStarterId?: unknown;
  internalCallRequestId?: unknown;
  resumeCallNoteId?: unknown;
  forceBeginOnboarding?: unknown;
  forceCompleteOnboarding?: unknown;
}) {
  const value = body.mockInterviewOpportunityId;
  if (value == null || value === "") return null;
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value.trim()
    )
  ) {
    throw new MockInterviewRequestError("Invalid mockInterviewOpportunityId");
  }
  if (
    body.conversationStarterId ||
    body.internalCallRequestId ||
    body.resumeCallNoteId ||
    body.forceBeginOnboarding ||
    body.forceCompleteOnboarding
  ) {
    throw new MockInterviewRequestError(
      "Mock interview cannot be combined with another call purpose"
    );
  }
  return value.trim();
}

export async function fetchMockInterviewContext(
  args: {
    admin: Parameters<typeof fetchTalentOpportunityHistoryByIds>[0]["admin"];
    userId: string;
    opportunityId: string;
  },
  fetchHistory = fetchTalentOpportunityHistoryByIds
): Promise<MockInterviewContext> {
  const [item] = await fetchHistory({
    admin: args.admin,
    userId: args.userId,
    ids: [args.opportunityId],
  });
  if (!item)
    throw new MockInterviewRequestError(
      "Mock interview opportunity not found",
      404
    );
  // Whitelist candidate-visible fields; do not inject matching notes or private company data.
  return {
    companyName: item.companyName,
    roleTitle: item.title,
    jd: item.description,
    companyDescription: item.companyDescription,
    location: item.location ?? null,
  };
}
