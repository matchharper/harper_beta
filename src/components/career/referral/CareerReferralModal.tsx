import Link from "next/link";
import { Check, Copy, ExternalLink, Loader2, Share2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Text } from "@/components/ui/text";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import {
  copyTextToClipboard,
  fetchTalentNetworkReferralSummary,
  type TalentNetworkReferralSummary,
} from "@/lib/talentNetworkReferral";
import { cn } from "@/lib/utils";
import { showToast } from "@/components/toast/toast";
import { useCareerT } from "@/i18n/useCareerT";

type CareerReferralModalProps = {
  onClose: () => void;
  open: boolean;
};

const emptyStats = {
  hires: 0,
  signups: 0,
  visits: 0,
};

type CareerT = ReturnType<typeof useCareerT>;

function buildReferralInviteMessage(t: CareerT, referralUrl: string) {
  const link =
    referralUrl ||
    t("career.referral.modal.invite_message_link_placeholder", "[초대 링크]");

  return t(
    "career.referral.modal.invite_message",
    "안녕하세요, Harper가 도움이 될 것 같아서 링크 공유드려요.\n\nHarper는 이력서를 먼저 올리고 기다리는 채용 플랫폼이라기보다, 대화로 커리어 맥락과 선호를 파악한 뒤 맞을 만한 기회를 골라 소개해주는 서비스예요. 당장 이직 중이 아니어도 어떤 팀이나 역할이 맞을지 가볍게 확인해볼 수 있습니다.\n\n관심 있으면 아래 링크로 들어가 한번 대화해보세요.\n{link}",
    { values: { link } }
  );
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

export default function CareerReferralModal({
  onClose,
  open,
}: CareerReferralModalProps) {
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
    if (!open) return;
    const timeoutId = window.setTimeout(() => {
      void loadSummary();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadSummary, open]);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const referralUrl = summary?.url ?? "";
  const inviteMessage = buildReferralInviteMessage(t, referralUrl);
  const stats = summary?.stats ?? emptyStats;
  const howItWorks = [
    {
      title: t(
        "career.referral.modal.step1_title",
        "소개할 사람을 정합니다."
      ),
      description: t(
        "career.referral.modal.step1_description",
        "커리어 기회를 살펴보면 좋을 친구나 동료에게 초대 링크와 짧은 소개를 보내세요."
      ),
    },
    {
      title: t(
        "career.referral.modal.step2_title",
        "상대방이 링크로 가입합니다."
      ),
      description: t(
        "career.referral.modal.step2_description",
        "가입 요청 시점에 확인되는 추천 링크를 기준으로 내 초대 기록에 반영됩니다."
      ),
    },
    {
      title: t(
        "career.referral.modal.step3_title",
        "채용되면 보상을 받을 수 있습니다."
      ),
      description: t(
        "career.referral.modal.step3_description",
        "Harper를 통한 채용 확정과 정산이 완료되면 약관에 따라 보상이 검토됩니다."
      ),
    },
  ] as const;

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
    <TalentCareerModal
      open={open}
      onClose={onClose}
      ariaLabel={t("career.referral.modal.aria_label", "Harper 초대하기")}
      panelClassName=" scrollbar-thin scrollbar-thumb-neutral-1000-a05 scrollbar-track-neutral-1000-a0 max-h-[min(760px,calc(100svh-32px))] w-[min(720px,calc(100vw-32px))] overflow-y-auto rounded-xl bg-bg-default"
      bodyClassName="p-05"
      closeButtonClassName="text-neutral-soft hover:bg-bg-weak hover:text-neutral-primary"
    >
      <section className="text-neutral-primary">
        <header className="border-b border-neutral-1000-a05 px-5 pb-5 pt-6 sm:px-6">
          <Text as="h2" type="head2" className="pr-10">
            {t(
              "career.referral.modal.title",
              "친구나 동료에게 Harper를 소개하세요"
            )}
          </Text>
          <p className="mt-3 max-w-[58ch] text-[14px] leading-6 text-neutral-muted">
            {t(
              "career.referral.modal.description",
              "친구나 동료가 내 링크로 가입하고 Harper를 통해 채용되면, 조건에 따라 $2,000에서 $5,000 사이의 보상을 받을 수 있습니다."
            )}
            <Link
              href="/referral-terms"
              target="_blank"
              className="text-neutral-900 ml-1 inline-flex items-center gap-1 text-[14px] leading-4 underline decoration-dotted"
            >
              {t(
                "career.referral.modal.read_terms",
                "전체 약관 보기"
              )}
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </p>
        </header>

        <div className="px-5 py-5 sm:px-6">
          <section>
            <Text as="h3" type="body" className="font-normal">
              {t("career.referral.modal.how_it_works", "진행 방식")}
            </Text>
            <div className="mt-3 divide-y divide-neutral-1000-a05 rounded-lg border border-neutral-1000-a05 bg-bg-floating">
              {howItWorks.map((item, index) => (
                <div
                  key={item.title}
                  className="grid gap-3 px-4 py-4 sm:grid-cols-[44px_1fr]"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-bg-weak text-[13px] font-semibold text-neutral-primary">
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[14px] font-normal leading-5 text-neutral-primary">
                      {item.title}
                    </div>
                    <p className="mt-1 text-[13px] leading-5 text-neutral-muted">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-6 border-t border-neutral-1000-a05 pt-5">
            <Text as="h3" type="body" className="font-normal">
              {t("career.referral.modal.share_link_heading", "초대 링크 공유")}
            </Text>
            <p className="mt-2 text-[13px] leading-5 text-neutral-muted">
            {t(
              "career.referral.modal.share_link_description",
              "초대 링크와 짧은 소개 문구를 함께 보내면 상대방이 Harper를 이해하기 쉽습니다."
            )}
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input
                readOnly
                value={
                  loading && !referralUrl
                    ? t(
                        "career.referral.modal.link_loading",
                        "초대 링크를 준비하는 중입니다."
                      )
                    : referralUrl
                }
                className="h-8.5 flex-1"
                onFocus={(event) => event.currentTarget.select()}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={!referralUrl || loading}
                  onClick={handleCopy}
                  className="flex-1 sm:flex-none bg-primary border-none"
                >
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {copied
                    ? t("career.referral.modal.copied", "복사됨")
                    : t("career.referral.modal.copy", "복사")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!referralUrl || loading}
                  onClick={() => void handleShare()}
                  className="flex-1 sm:flex-none"
                >
                  <Share2 className="h-4 w-4" />
                  {t("career.referral.modal.share", "공유")}
                </Button>
              </div>
            </div>
            {error ? (
              <div className="mt-3 rounded-md border border-critical/30 bg-critical-faded px-3 py-2 text-[12px] leading-5 text-critical">
                {error}
              </div>
            ) : null}
            <div className="mt-4 rounded-lg border border-neutral-1000-a05 bg-bg-floating p-3">
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
                      "초대 링크가 포함된 문구입니다. 복사한 뒤 필요하면 다듬어 보내세요."
                    )}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!referralUrl || loading}
                  onClick={() => void handleCopyInviteMessage()}
                  className="w-full sm:w-auto"
                >
                  {inviteMessageCopied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {inviteMessageCopied
                    ? t("career.referral.modal.copied", "복사됨")
                    : t(
                        "career.referral.modal.copy_invite_message",
                        "문구 복사"
                      )}
                </Button>
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

          <section className="mt-6 border-t border-neutral-1000-a05 pt-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <Text as="h3" type="body" className="font-normal">
                  {t("career.referral.modal.reward_heading", "추천 보상")}
                </Text>
                <p className="mt-2 text-[13px] leading-5 text-neutral-muted">
                  {t(
                    "career.referral.modal.reward_description",
                    "추천한 사람이 Harper를 통해 채용되면 연봉, 계약 조건, 실제 수수료에 따라 보상이 검토됩니다."
                  )}
                </p>
              </div>
              <div className="text-[20px] font-semibold leading-7 text-neutral-primary">
                {t("career.referral.modal.reward_range", "$2,000 - $5,000")}
              </div>
            </div>
            <div className="pt-4">
              <div className="text-[12px] font-medium leading-4 text-neutral-soft">
                {t("career.referral.modal.example_reward_heading", "예시 보상")}
              </div>
              <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-[13px] leading-5 text-neutral-muted">
                    {t(
                      "career.referral.modal.example_basis",
                      "연봉 $15,000 채용 1건 기준"
                    )}
                  </div>
                  <div className="mt-1 text-[28px] font-semibold leading-8 text-neutral-primary">
                    {t("career.referral.modal.example_reward", "$3,000")}
                  </div>
                </div>
                <div className="text-[12px] leading-5 text-neutral-soft">
                  {t(
                    "career.referral.modal.example_review_note",
                    "채용 확정 및 정산 후 검토"
                  )}
                </div>
              </div>
              <dl className="mt-4 divide-y divide-neutral-1000-a05 text-[13px] leading-5">
                <div className="flex items-center justify-between gap-4 py-2">
                  <dt className="text-neutral-muted">
                    {t(
                      "career.referral.modal.first_year_salary_label",
                      "첫해 연봉"
                    )}
                  </dt>
                  <dd className="font-medium text-neutral-primary">
                    {t(
                      "career.referral.modal.example_salary",
                      "$15,000"
                    )}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4 py-2">
                  <dt className="text-neutral-muted">
                    {t("career.referral.modal.your_cut_label", "내 보상 기준")}
                  </dt>
                  <dd className="text-right font-medium text-neutral-primary">
                    {t(
                      "career.referral.modal.your_cut_value",
                      "Harper 채용 수수료의 일부"
                    )}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4 py-2">
                  <dt className="text-neutral-muted">
                    {t("career.referral.modal.your_reward_label", "내 보상")}
                  </dt>
                  <dd className="font-medium text-neutral-primary">
                    {t("career.referral.modal.example_reward", "$3,000")}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-[12px] leading-5 text-neutral-muted font-normal">
                {t(
                  "career.referral.modal.reward_note",
                  "실제 보상은 연봉, 계약 형태, Harper가 실제 수령하는 수수료, 내부 검토 결과에 따라 달라질 수 있습니다."
                )}
              </p>
            </div>
          </section>

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
                "mt-3 grid grid-cols-3 overflow-hidden rounded-lg border border-neutral-1000-a05 bg-bg-floating",
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
            </div>
            <p className="mt-3 text-[12px] leading-5 text-neutral-soft">
              {t(
                "career.referral.modal.stats_note",
                "숫자는 중복 제거와 내부 검토 과정에서 조정될 수 있습니다. 추천받은 사람의 개인 정보나 진행 상황은 표시하지 않습니다."
              )}
            </p>
          </section>
        </div>
      </section>
    </TalentCareerModal>
  );
}
