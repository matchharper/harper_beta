import { fetchTalentOpportunityHistoryByRoleIds } from "@/lib/talentOpportunity";
import {
  extractMockInterviewRoleIds,
  type MockInterviewOffer,
} from "./mockInterviewOffers";

export async function hydrateMockInterviewOffers<
  T extends { role: string; content: string },
>(
  args: {
    admin: Parameters<
      typeof fetchTalentOpportunityHistoryByRoleIds
    >[0]["admin"];
    userId: string;
    messages: T[];
  },
  fetchHistory = fetchTalentOpportunityHistoryByRoleIds
): Promise<Array<T & { mockInterviewOffers: MockInterviewOffer[] }>> {
  const roleIds = [
    ...new Set(
      args.messages.flatMap((message) =>
        message.role === "assistant"
          ? extractMockInterviewRoleIds(message.content)
          : []
      )
    ),
  ];
  let offers: MockInterviewOffer[] = [];
  if (roleIds.length) {
    try {
      const items = await fetchHistory({
        admin: args.admin,
        userId: args.userId,
        roleIds,
        includeActivityTimeline: false,
      });
      // Only public card fields; never forward role/company notes from the lookup.
      offers = items.map((item) => ({
        id: item.id,
        roleId: item.roleId,
        companyLogoUrl: item.companyLogoUrl,
        companyName: item.companyName,
        title: item.title,
      }));
    } catch (error) {
      console.warn("[MockInterviewOffers] Failed to resolve positions", error);
    }
  }
  const byRole = new Map(offers.map((offer) => [offer.roleId, offer]));
  return args.messages.map((message) => ({
    ...message,
    mockInterviewOffers:
      message.role === "assistant"
        ? extractMockInterviewRoleIds(message.content).flatMap((id) => {
            const offer = byRole.get(id);
            return offer ? [offer] : [];
          })
        : [],
  }));
}
