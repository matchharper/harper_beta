import { useInfiniteQuery } from "@tanstack/react-query";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerT } from "@/i18n/useCareerT";
import { MuteButton } from "@/components/ui/button";
import { useOptionalCareerChatPanelContext } from "../CareerChatPanelContext";
import { CareerInlineForms } from "../chat/CareerInlineForms";

type Review = { conversationId: string; formId: number; revision: number };
type ReviewPage = { reviews: Review[]; next: number | null };

type OpportunityLink = { roleId?: string; opportunityId?: string };
export function OpportunityReviews(props: OpportunityLink) {
  const userId = useOptionalCareerChatPanelContext()?.user?.id;
  return userId && (props.roleId || props.opportunityId) ? <ReviewsList userId={userId} {...props} /> : null;
}

function ReviewsList({ roleId, opportunityId, userId }: OpportunityLink & { userId: string }) {
  const { fetchWithAuth } = useCareerApi();
  const t = useCareerT();
  const list = useInfiniteQuery({
    queryKey: ["career-opportunity-reviews", userId, roleId, opportunityId],
    initialPageParam: null as number | null,
    getNextPageParam: (page: ReviewPage) => page.next,
    queryFn: async ({ pageParam, signal }): Promise<ReviewPage> => {
      const params = new URLSearchParams();
      if (roleId) params.set("roleId", roleId);
      if (opportunityId) params.set("opportunityId", opportunityId);
      if (pageParam) params.set("before", String(pageParam));
      const response = await fetchWithAuth(`/api/talent/forms/opportunity?${params}`, { signal });
      if (!response.ok) throw new Error("Opportunity reviews unavailable");
      return response.json();
    },
  });
  const reviews = list.data?.pages.flatMap(page => page.reviews) ?? [];
  if (!reviews.length && !list.isError) return null;
  return <section className="space-y-3">
    <h3 className="text-sm font-semibold">{t("career.opportunity.reviews", "검토할 내용")}</h3>
    {list.isError && <div role="alert">
      {t("career.forms.unavailable", "질문을 불러오지 못했어요.")}
      <MuteButton onClick={() => void list.refetch()}>{t("career.forms.retry", "다시 불러오기")}</MuteButton>
    </div>}
    {reviews.map(review => <CareerInlineForms key={review.formId} formIds={[review.formId]}
      origin={review} onOriginChange={() => void list.refetch()} />)}
    {list.hasNextPage && <MuteButton disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
      {t("career.resources.more", "더 보기")}
    </MuteButton>}
  </section>;
}
