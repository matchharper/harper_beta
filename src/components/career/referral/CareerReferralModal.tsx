import Image from "next/image";
import { Check, Copy, Loader2, Share2 } from "lucide-react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Text } from "@/components/ui/text";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import {
  copyTextToClipboard,
  fetchTalentNetworkReferralList,
  fetchTalentNetworkReferralRewardList,
  fetchTalentNetworkReferralSummary,
  type TalentNetworkReferralListItem,
  type TalentNetworkReferralRewardItem,
  type TalentNetworkReferralSummary,
} from "@/lib/talentNetworkReferral";
import { cn } from "@/lib/utils";
import { showToast } from "@/components/toast/toast";
import { useCareerT } from "@/i18n/useCareerT";
import {
  ReferralProgramHowItWorks,
  ReferralProgramIntroduction,
  ReferralProgramReward,
} from "./ReferralProgramOverview";

type CareerReferralModalProps = {
  onClose: () => void;
  open: boolean;
};

type CareerReferralSettingsSectionProps = {
  active?: boolean;
};

const REFERRAL_LIST_PAGE_SIZE = 10;
const REFERRAL_REWARD_LIST_PAGE_SIZE = 10;

const emptyStats = {
  hires: 0,
  paid: 0,
  signups: 0,
  visits: 0,
};

const REFERRAL_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Seoul",
  year: "numeric",
});

type CareerT = ReturnType<typeof useCareerT>;

function buildReferralInviteMessage(t: CareerT, referralUrl: string) {
  const link =
    referralUrl ||
    t("career.referral.modal.invite_message_link_placeholder", "[초대 링크]");

  return t(
    "career.referral.modal.invite_message",
    "안녕하세요, 커리어 기회를 살펴볼 때 Harper가 도움이 될 것 같아 공유드려요.\n\nHarper는 대화를 통해 지금까지의 경험과 다음 커리어에서 원하는 점을 파악하고, 잘 맞을 만한 회사와 역할을 찾아 소개해주는 서비스예요. 당장 이직할 계획이 없어도 가볍게 대화를 시작해볼 수 있습니다.\n\n궁금하면 아래 링크에서 확인해보세요.\n{link}",
    { values: { link } }
  );
}

function getReferralInitial(name: string) {
  const trimmed = name.trim();
  return (trimmed[0] ?? "?").toUpperCase();
}

function formatReferralDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const parts = REFERRAL_DATE_FORMATTER.formatToParts(date);
  const valueByType = new Map(parts.map((part) => [part.type, part.value]));
  const year = valueByType.get("year");
  const month = valueByType.get("month");
  const day = valueByType.get("day");

  return year && month && day ? `${year}.${month}.${day}` : "-";
}

function StatItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 border-r border-neutral-1000-a05 px-3 py-3 last:border-r-0 sm:px-4">
      <div className="text-[20px] font-semibold leading-7 text-neutral-primary">
        {Number.isFinite(value) ? value.toLocaleString() : "0"}
      </div>
      <div className="mt-0.5 text-[12px] leading-4 text-neutral-muted">
        {label}
      </div>
    </div>
  );
}

function ReferralTableRow({
  candidate,
  t,
}: {
  candidate: TalentNetworkReferralListItem;
  t: CareerT;
}) {
  const name =
    candidate.name ||
    t("career.referral.modal.referral_name_empty", "Harper 사용자");
  const headline =
    candidate.headline ||
    t("career.referral.modal.referral_headline_empty", "프로필 소개 없음");

  return (
    <tr className="border-t border-neutral-1000-a05">
      <td className="px-3 py-2.5 align-middle">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full bg-bg-weak">
            {candidate.profilePicture ? (
              <Image
                src={candidate.profilePicture}
                alt={name}
                fill
                sizes="28px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[11px] font-medium text-neutral-muted">
                {getReferralInitial(name)}
              </div>
            )}
          </div>
          <div className="min-w-0 truncate text-[13px] font-medium leading-5 text-neutral-primary">
            {name}
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 align-middle">
        <div className="truncate text-[12px] leading-4 text-neutral-muted">
          {headline}
        </div>
      </td>
      <td className="px-3 py-2.5 align-middle text-[12px] leading-4 text-neutral-muted">
        {formatReferralDate(candidate.joinedAt)}
      </td>
      <td className="px-3 py-2.5 text-right align-middle">
        <Badge
          size="sm"
          radius="full"
          tone={candidate.hired ? "positive" : "neutral"}
          variant="faded"
        >
          {candidate.hired
            ? t("career.referral.modal.referral_hired", "채용됨")
            : t("career.referral.modal.referral_not_hired", "가입 완료")}
        </Badge>
      </td>
    </tr>
  );
}

function ReferralRewardTableRow({
  candidate,
  t,
}: {
  candidate: TalentNetworkReferralRewardItem;
  t: CareerT;
}) {
  const name =
    candidate.name ||
    t("career.referral.modal.referral_name_empty", "Harper 사용자");

  return (
    <tr className="border-t border-neutral-1000-a05">
      <td className="px-3 py-2.5 align-middle">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full bg-bg-weak">
            {candidate.profilePicture ? (
              <Image
                src={candidate.profilePicture}
                alt={name}
                fill
                sizes="28px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[11px] font-medium text-neutral-muted">
                {getReferralInitial(name)}
              </div>
            )}
          </div>
          <div className="min-w-0 truncate text-[13px] font-medium leading-5 text-neutral-primary">
            {name}
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 align-middle">
        <Badge
          size="sm"
          radius="full"
          tone={candidate.hiredConfirmed ? "positive" : "neutral"}
          variant="faded"
        >
          {candidate.hiredConfirmed
            ? t("career.referral.modal.hiring_confirmed", "확정")
            : t("career.referral.modal.hiring_not_confirmed", "미확정")}
        </Badge>
      </td>
      <td className="px-3 py-2.5 align-middle text-[12px] leading-4 text-neutral-muted">
        {formatReferralDate(candidate.rewardDueAt)}
      </td>
      <td className="px-3 py-2.5 align-middle text-[12px] font-medium leading-4 text-neutral-primary">
        {candidate.amount || "-"}
      </td>
      <td className="px-3 py-2.5 text-right align-middle">
        <Badge
          size="sm"
          radius="full"
          tone={candidate.rewardPaid ? "positive" : "neutral"}
          variant="faded"
        >
          {candidate.rewardPaid
            ? t("career.referral.modal.reward_paid", "지급 완료")
            : t("career.referral.modal.reward_not_paid", "지급 예정")}
        </Badge>
      </td>
    </tr>
  );
}

function ReferralRewardSection({
  error,
  hasNextPage,
  isError,
  isFetching,
  isFetchingNextPage,
  isLoading,
  items,
  onLoadMore,
  onRetry,
  t,
  total,
}: {
  error: unknown;
  hasNextPage: boolean;
  isError: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  items: TalentNetworkReferralRewardItem[];
  onLoadMore: () => void;
  onRetry: () => void;
  t: CareerT;
  total: number;
}) {
  return (
    <section className="mt-6 border-t border-neutral-1000-a05 pt-5">
      <div className="flex items-center justify-between gap-3">
        <Text as="h3" type="body" className="font-semibold">
          {t(
            "career.referral.modal.hiring_reward_heading",
            "채용 및 보상 현황"
          )}
        </Text>
        {isFetching && !isLoading ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-neutral-soft">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("career.referral.modal.updating", "업데이트 중")}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-[13px] leading-5 text-neutral-muted">
        {t(
          "career.referral.modal.hiring_reward_summary",
          "채용이 확정되어 보상 절차가 진행 중인 내역",
          { values: { count: total } }
        )}
      </p>

      {isError ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-critical/30 bg-critical-faded px-3 py-2 text-[12px] leading-5 text-critical">
          <span>
            {error instanceof Error
              ? error.message
              : t(
                  "career.referral.modal.error_reward_list_load_failed",
                  "채용 및 보상 현황을 불러오지 못했습니다."
                )}
          </span>
          <MuteButton type="button" onClick={onRetry}>
            {t("career.referral.modal.retry", "다시 시도")}
          </MuteButton>
        </div>
      ) : items.length > 0 ? (
        <>
          <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-1000-a05 bg-bg-default">
            <table className="w-full min-w-[720px] table-fixed border-collapse text-left">
              <thead className="bg-bg-weak text-[11px] leading-4 text-neutral-soft">
                <tr>
                  <th scope="col" className="w-[25%] px-3 py-2 font-normal">
                    {t("career.referral.modal.reward_table_candidate", "이름")}
                  </th>
                  <th scope="col" className="w-[120px] px-3 py-2 font-normal">
                    {t(
                      "career.referral.modal.reward_table_hired",
                      "채용 확정 여부"
                    )}
                  </th>
                  <th scope="col" className="w-[132px] px-3 py-2 font-normal">
                    {t(
                      "career.referral.modal.reward_table_due_at",
                      "보상지급 예정일"
                    )}
                  </th>
                  <th scope="col" className="px-3 py-2 font-normal">
                    {t("career.referral.modal.reward_table_amount", "금액")}
                  </th>
                  <th
                    scope="col"
                    className="w-[132px] px-3 py-2 text-right font-normal"
                  >
                    {t(
                      "career.referral.modal.reward_table_paid",
                      "보상지급완료여부"
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((candidate) => (
                  <ReferralRewardTableRow
                    key={candidate.id}
                    candidate={candidate}
                    t={t}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {hasNextPage ? (
            <MuteButton
              type="button"
              disabled={isFetchingNextPage}
              onClick={onLoadMore}
              className="mt-3 w-full"
            >
              {isFetchingNextPage ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {t("career.referral.modal.referrals_load_more", "더 보기")}
            </MuteButton>
          ) : null}
        </>
      ) : isLoading ? (
        <div className="mt-3 flex items-center gap-2 text-[13px] text-neutral-soft">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("career.referral.modal.updating", "업데이트 중")}
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-neutral-1000-a05 bg-bg-default px-4 py-6 text-center text-[13px] text-neutral-soft">
          {t(
            "career.referral.modal.hiring_reward_empty",
            "아직 채용 및 보상 현황이 없습니다."
          )}
        </div>
      )}
    </section>
  );
}

export function CareerReferralSettingsSection({
  active = true,
}: CareerReferralSettingsSectionProps) {
  const t = useCareerT();
  const { fetchWithAuth } = useCareerApi();
  const [summary, setSummary] = useState<TalentNetworkReferralSummary | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [inviteMessageCopied, setInviteMessageCopied] = useState(false);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const nextSummary = await fetchTalentNetworkReferralSummary(
        fetchWithAuth,
        {
          summaryLoadFailed: t(
            "career.referral.modal.error_summary_load_failed",
            "초대 정보를 불러오지 못했습니다."
          ),
        }
      );
      setSummary(nextSummary);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : t(
              "career.referral.modal.error_summary_load_failed",
              "초대 정보를 불러오지 못했습니다."
            )
      );
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth, t]);

  useEffect(() => {
    if (!active) return;
    const timeoutId = window.setTimeout(() => {
      void loadSummary();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [active, loadSummary]);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const referralUrl = summary?.url ?? "";
  const inviteMessage = buildReferralInviteMessage(t, referralUrl);
  const stats = summary?.stats ?? emptyStats;
  const referralsQuery = useInfiniteQuery({
    queryKey: [
      "career-referral-list",
      summary?.token ?? "pending",
      REFERRAL_LIST_PAGE_SIZE,
    ],
    queryFn: ({ pageParam }) =>
      fetchTalentNetworkReferralList(fetchWithAuth, {
        limit: REFERRAL_LIST_PAGE_SIZE,
        messages: {
          referralListLoadFailed: t(
            "career.referral.modal.error_referral_list_load_failed",
            "초대 목록을 불러오지 못했습니다."
          ),
        },
        offset: pageParam,
      }),
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    initialPageParam: 0,
    enabled: active && Boolean(summary?.token),
    staleTime: 30_000,
  });
  const rewardsQuery = useInfiniteQuery({
    queryKey: [
      "career-referral-reward-list",
      summary?.token ?? "pending",
      REFERRAL_REWARD_LIST_PAGE_SIZE,
    ],
    queryFn: ({ pageParam }) =>
      fetchTalentNetworkReferralRewardList(fetchWithAuth, {
        limit: REFERRAL_REWARD_LIST_PAGE_SIZE,
        messages: {
          applicationListLoadFailed: t(
            "career.referral.modal.error_reward_list_load_failed",
            "채용 및 보상 현황을 불러오지 못했습니다."
          ),
        },
        offset: pageParam,
      }),
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    initialPageParam: 0,
    enabled: active && Boolean(summary?.token),
    staleTime: 30_000,
  });
  const referrals =
    referralsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const referralTotal = referralsQuery.data?.pages[0]?.total ?? stats.signups;
  const rewards = rewardsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const rewardTotal = rewardsQuery.data?.pages[0]?.total ?? rewards.length;
  useEffect(() => {
    if (!inviteMessageCopied) return;
    const timeout = window.setTimeout(
      () => setInviteMessageCopied(false),
      1600
    );
    return () => window.clearTimeout(timeout);
  }, [inviteMessageCopied]);

  const handleCopy = async () => {
    if (!referralUrl) return;
    try {
      await copyTextToClipboard(referralUrl);
      setCopied(true);
      showToast({
        message: t(
          "career.referral.modal.toast_link_copied",
          "초대 링크가 복사되었습니다."
        ),
        variant: "white",
      });
    } catch {
      showToast({
        message: t(
          "career.referral.modal.toast_link_copy_failed",
          "링크 복사에 실패했습니다."
        ),
        variant: "error",
      });
    }
  };

  const handleShare = async () => {
    if (!referralUrl || typeof navigator === "undefined" || !navigator.share) {
      await handleCopy();
      return;
    }

    try {
      await navigator.share({
        text: t(
          "career.referral.modal.share_text",
          "Harper에서 커리어 기회를 함께 찾아보세요."
        ),
        title: t("career.referral.modal.share_title", "Harper 초대"),
        url: referralUrl,
      });
    } catch (shareError) {
      if (
        shareError instanceof DOMException &&
        shareError.name === "AbortError"
      ) {
        return;
      }
      await handleCopy();
    }
  };

  const handleCopyInviteMessage = async () => {
    if (!referralUrl) return;
    try {
      await copyTextToClipboard(inviteMessage);
      setInviteMessageCopied(true);
      showToast({
        message: t(
          "career.referral.modal.toast_invite_message_copied",
          "소개 문구가 복사되었습니다."
        ),
        variant: "white",
      });
    } catch {
      showToast({
        message: t(
          "career.referral.modal.toast_invite_message_copy_failed",
          "소개 문구 복사에 실패했습니다."
        ),
        variant: "error",
      });
    }
  };

  return (
    <section className="break-keep text-neutral-primary pb-48">
      <ReferralProgramIntroduction headingAs="h3" titleClassName="pr-10" />

      <div className="mt-4 py-5">
        <ReferralProgramHowItWorks headingAs="h3" />

        <section className="mt-6 border-t border-neutral-1000-a05 pt-5">
          <Text as="h3" type="body" className="font-normal">
            {t("career.referral.modal.share_link_heading", "초대 링크 공유")}
          </Text>
          <p className="mt-2 text-[13px] leading-5 text-neutral-muted">
            {t(
              "career.referral.modal.share_link_description",
              "링크를 복사한 뒤 아래 소개 문구와 함께 보내면 상대방이 Harper를 이해하기 쉽습니다."
            )}
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row bg-primary-faded p-3 rounded-md">
            <Input
              readOnly
              value={
                !referralUrl && !error
                  ? t(
                      "career.referral.modal.link_loading",
                      "초대 링크를 준비하는 중입니다."
                    )
                  : referralUrl
              }
              className="h-8.5 flex-1 border-primary"
              onFocus={(event) => event.currentTarget.select()}
            />
            <div className="flex gap-2">
              <MuteButton
                type="button"
                variant="primary"
                disabled={!referralUrl || loading}
                onClick={handleCopy}
                className="flex-1 gap-1.5 sm:flex-none"
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {copied
                  ? t("career.referral.modal.copied", "복사됨")
                  : t("career.referral.modal.copy", "복사")}
              </MuteButton>
              <MuteButton
                type="button"
                disabled={!referralUrl || loading}
                onClick={() => void handleShare()}
                className="flex-1 gap-1.5 sm:flex-none"
              >
                <Share2 className="h-4 w-4" />
                {t("career.referral.modal.share", "공유")}
              </MuteButton>
            </div>
          </div>
          {error ? (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-critical/30 bg-critical-faded px-3 py-2 text-[12px] leading-5 text-critical">
              <span>{error}</span>
              <MuteButton type="button" onClick={() => void loadSummary()}>
                {t("career.referral.modal.retry", "다시 시도")}
              </MuteButton>
            </div>
          ) : null}
          <div className="mt-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-[13px] font-medium leading-5 text-neutral-primary">
                  {t(
                    "career.referral.modal.invite_message_heading",
                    "함께 보낼 소개 문구"
                  )}
                </div>
                <p className="mt-1 text-[12px] leading-5 text-neutral-muted">
                  {t(
                    "career.referral.modal.invite_message_description",
                    "내 초대 링크가 자동으로 들어갑니다. 그대로 복사하거나 상대방에 맞게 다듬어 보내세요."
                  )}
                </p>
              </div>
              <MuteButton
                type="button"
                disabled={!referralUrl || loading}
                onClick={() => void handleCopyInviteMessage()}
                className="sm:w-auto"
              >
                {inviteMessageCopied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {inviteMessageCopied
                  ? t("career.referral.modal.copied", "복사됨")
                  : t("career.referral.modal.copy_invite_message", "문구 복사")}
              </MuteButton>
            </div>
            <Textarea
              readOnly
              value={inviteMessage}
              rows={7}
              className="mt-3 min-h-[160px] text-[13px] leading-5"
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
        </section>

        <ReferralProgramReward headingAs="h3" />

        <section className="mt-6 border-t border-neutral-1000-a05 pt-5">
          <div className="flex items-center justify-between gap-3">
            <Text as="h3" type="body" className="font-semibold">
              {t("career.referral.modal.stats_heading", "내 초대 현황")}
            </Text>
            {loading ? (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-neutral-soft">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("career.referral.modal.updating", "업데이트 중")}
              </span>
            ) : null}
          </div>
          <div
            className={cn(
              "mt-3 grid grid-cols-4 overflow-hidden rounded-lg border border-neutral-1000-a05 bg-bg-floating",
              loading && !summary && "opacity-70"
            )}
          >
            <StatItem
              label={t("career.referral.modal.stats_visits", "링크 방문")}
              value={stats.visits}
            />
            <StatItem
              label={t("career.referral.modal.stats_signups", "회원가입")}
              value={stats.signups}
            />
            <StatItem
              label={t("career.referral.modal.stats_hires", "채용 확정")}
              value={stats.hires}
            />
            <StatItem
              label={t("career.referral.modal.stats_paid", "비용 지급됨")}
              value={stats.paid}
            />
          </div>
          <p className="mt-3 text-[12px] leading-5 text-neutral-soft">
            {t(
              "career.referral.modal.stats_note",
              "방문 수는 중복 제거 등의 이유로 조정될 수 있습니다. 초대 목록에는 가입한 사람의 기본 프로필과 채용 여부만 표시되며, 회사명이나 상세 채용 진행은 공개되지 않습니다."
            )}
          </p>
        </section>

        <ReferralRewardSection
          error={rewardsQuery.error}
          hasNextPage={Boolean(rewardsQuery.hasNextPage)}
          isError={rewardsQuery.isError}
          isFetching={rewardsQuery.isFetching}
          isFetchingNextPage={rewardsQuery.isFetchingNextPage}
          isLoading={rewardsQuery.isLoading}
          items={rewards}
          total={rewardTotal}
          t={t}
          onLoadMore={() => void rewardsQuery.fetchNextPage()}
          onRetry={() => void rewardsQuery.refetch()}
        />

        <section className="mt-6 border-t border-neutral-1000-a05 pt-5">
          <div className="flex items-center justify-between gap-3">
            <Text as="h3" type="body" className="font-semibold">
              {t("career.referral.modal.referrals_heading", "초대 목록")}
            </Text>
            {referralsQuery.isFetching && !referralsQuery.isLoading ? (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-neutral-soft">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("career.referral.modal.updating", "업데이트 중")}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-[13px] leading-5 text-neutral-muted">
            {referralTotal === 1
              ? t(
                  "career.referral.modal.referrals_summary_singular",
                  "지금까지 1명이 내 링크로 가입했습니다."
                )
              : t(
                  "career.referral.modal.referrals_summary",
                  "지금까지 {count}명이 내 링크로 가입했습니다.",
                  { values: { count: referralTotal } }
                )}
          </p>

          {referralsQuery.isError ? (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-critical/30 bg-critical-faded px-3 py-2 text-[12px] leading-5 text-critical">
              <span>
                {referralsQuery.error instanceof Error
                  ? referralsQuery.error.message
                  : t(
                      "career.referral.modal.error_referral_list_load_failed",
                      "초대 목록을 불러오지 못했습니다."
                    )}
              </span>
              <MuteButton
                type="button"
                onClick={() => void referralsQuery.refetch()}
              >
                {t("career.referral.modal.retry", "다시 시도")}
              </MuteButton>
            </div>
          ) : referrals.length > 0 ? (
            <>
              <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-1000-a05 bg-bg-default">
                <table className="w-full min-w-[620px] table-fixed border-collapse text-left">
                  <thead className="bg-bg-weak text-[11px] leading-4 text-neutral-soft">
                    <tr>
                      <th scope="col" className="w-[30%] px-3 py-2 font-normal">
                        {t(
                          "career.referral.modal.referrals_table_candidate",
                          "이름"
                        )}
                      </th>
                      <th scope="col" className="px-3 py-2 font-normal">
                        {t(
                          "career.referral.modal.referrals_table_headline",
                          "프로필 소개"
                        )}
                      </th>
                      <th
                        scope="col"
                        className="w-[104px] px-3 py-2 font-normal"
                      >
                        {t(
                          "career.referral.modal.referrals_table_joined_at",
                          "가입일"
                        )}
                      </th>
                      <th
                        scope="col"
                        className="w-[92px] px-3 py-2 text-right font-normal"
                      >
                        {t(
                          "career.referral.modal.referrals_table_status",
                          "상태"
                        )}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {referrals.map((candidate) => (
                      <ReferralTableRow
                        key={candidate.id}
                        candidate={candidate}
                        t={t}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {referralsQuery.hasNextPage ? (
                <MuteButton
                  type="button"
                  disabled={referralsQuery.isFetchingNextPage}
                  onClick={() => void referralsQuery.fetchNextPage()}
                  className="mt-3 w-full"
                >
                  {referralsQuery.isFetchingNextPage ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {t("career.referral.modal.referrals_load_more", "더 보기")}
                </MuteButton>
              ) : null}
            </>
          ) : referralsQuery.isLoading ? (
            <div className="mt-3 flex items-center gap-2 text-[13px] text-neutral-soft">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("career.referral.modal.updating", "업데이트 중")}
            </div>
          ) : null}
        </section>
      </div>
    </section>
  );
}

export default function CareerReferralModal({
  onClose,
  open,
}: CareerReferralModalProps) {
  const t = useCareerT();

  return (
    <TalentCareerModal
      open={open}
      onClose={onClose}
      ariaLabel={t("career.referral.modal.aria_label", "Harper 초대하기")}
      panelClassName="scrollbar-thin scrollbar-thumb-neutral-1000-a05 scrollbar-track-neutral-1000-a0 max-h-[min(760px,calc(100svh-32px))] w-[min(720px,calc(100vw-32px))] overflow-y-auto rounded-xl bg-bg-default"
      bodyClassName="p-0"
      closeButtonClassName="text-neutral-soft hover:bg-bg-weak hover:text-neutral-primary"
    >
      <CareerReferralSettingsSection active={open} />
    </TalentCareerModal>
  );
}
