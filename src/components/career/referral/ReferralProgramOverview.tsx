import Link from "next/link";
import { Dot, ExternalLink, UserRoundPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import { cn } from "@/lib/utils";

type CareerT = ReturnType<typeof useCareerT>;

function getReferralHowItWorks(t: CareerT) {
  return [
    {
      title: t(
        "career.referral.modal.step1_title",
        "소개할 사람에게 링크를 전달합니다."
      ),
      description: t(
        "career.referral.modal.step1_description",
        "Harper가 도움이 될 만한 친구나 동료에게 초대 링크와 소개 문구를 보내세요."
      ),
    },
    {
      title: t(
        "career.referral.modal.step2_title",
        "상대방이 링크로 가입합니다."
      ),
      description: t(
        "career.referral.modal.step2_description",
        "상대방이 가입할 때 사용한 추천 링크를 기준으로 내 초대 기록에 반영됩니다."
      ),
    },
    {
      title: t(
        "career.referral.modal.step3_title",
        "채용되면 보상을 받을 수 있습니다."
      ),
      description: t(
        "career.referral.modal.step3_description",
        "Harper를 통한 채용과 고객사 정산이 확인되면 약관에 따라 보상금을 지급합니다."
      ),
    },
  ] as const;
}

export function ReferralProgramIntroduction({
  headingAs = "h2",
  titleClassName,
}: {
  headingAs?: "h2" | "h3";
  titleClassName?: string;
}) {
  const t = useCareerT();
  const { locale } = useMessages();

  return (
    <header>
      <div className="mb-6 text-[20px]">
        {t(
          "career.referral.modal.reward_headline",
          "지인의 이직 한 번에 최대 1,000만원의 보상금을 드립니다."
        )}
      </div>
      <Text
        as={headingAs}
        type="title"
        className={cn("flex items-center gap-2", titleClassName)}
      >
        <UserRoundPlus strokeWidth={1.6} className="h-5 w-5" />
        {t("career.referral.modal.title", "주변 사람에게 Harper를 소개하세요")}
      </Text>
      <div className="mt-2 flex flex-col gap-1 text-[14px] font-normal leading-6 text-neutral-muted">
        <p className="leading-relaxed">
          <Dot className="mr-1 inline-block align-middle" />
          {t(
            "career.referral.modal.description",
            "내가 공유한 링크를 통해 가입한 사람이 Harper를 통해 채용되면 보상을 받을 수 있습니다."
          )}
        </p>
        <p className="leading-relaxed">
          <Dot className="mr-1 inline-block align-middle" />
          {t(
            "career.referral.modal.reward_fee_basis",
            "보상은 회사에서 Harper에게 제공하는 채용 수수료를 기준으로, 연봉과 계약 조건에 따라 달라질 수 있습니다."
          )}{" "}
          <span className="font-medium">
            {t("career.referral.modal.reward_fee_rate", "(수수료의 20%)")}
          </span>
        </p>
        <p className="leading-relaxed">
          <Dot className="mr-1 inline-block align-middle" />
          <span className="font-medium">
            {t(
              "career.referral.modal.reward_unlimited_heading",
              "보상 지급 횟수에 제한은 없습니다."
            )}
          </span>{" "}
          {t(
            "career.referral.modal.reward_unlimited_description",
            "여러 명이 Harper를 통해 여러 번 이직하면, 각 채용 건마다 보상을 검토합니다."
          )}
        </p>
        <Link
          href={{ pathname: "/referral-terms", query: { lang: locale } }}
          target="_blank"
          className="mt-3 inline-flex items-center gap-1 text-[14px] leading-4 text-neutral-900 underline decoration-dotted"
        >
          {t("career.referral.modal.read_terms", "전체 약관 보기")}
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="mt-5">
        <div className="text-[13px] font-medium leading-5 text-neutral-primary">
          {t(
            "career.referral.modal.top_open_roles",
            "현재 열려 있는 주요 포지션"
          )}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {[
            "Forward Deployed Engineer",
            "Research Engineer",
            "ML Engineer",
            "Marketer",
          ].map((role) => (
            <Badge
              key={role}
              size="md"
              radius="full"
              variant="subtle"
              className="bg-bg-floating px-2.5 font-normal text-neutral-muted shadow-sm"
            >
              {role}
            </Badge>
          ))}
          <span className="px-0.5 text-[12px] leading-5 text-neutral-soft">
            {t("career.referral.modal.top_open_roles_more", "그 외")}
          </span>
        </div>
      </div>
    </header>
  );
}

export function ReferralProgramHowItWorks({
  headingAs = "h2",
}: {
  headingAs?: "h2" | "h3";
}) {
  const t = useCareerT();
  const howItWorks = getReferralHowItWorks(t);

  return (
    <section>
      <Text as={headingAs} type="body" className="font-normal">
        {t("career.referral.modal.how_it_works", "진행 방식")}
      </Text>
      <ol className="mt-3">
        {howItWorks.map((item, index) => (
          <li key={item.title} className="grid grid-cols-[24px_1fr] gap-3 py-2">
            <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-bg-weak text-[13px] font-normal text-neutral-soft">
              {index + 1}
            </div>
            <div className="min-w-0">
              <div className="text-[14px] font-medium leading-5 text-neutral-primary">
                {item.title}
              </div>
              <p className="mt-1 text-[13px] leading-5 text-neutral-muted">
                {item.description}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ReferralProgramReward({
  headingAs = "h2",
}: {
  headingAs?: "h2" | "h3";
}) {
  const t = useCareerT();

  return (
    <section className="mt-6 border-t border-neutral-1000-a05 pt-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Text as={headingAs} type="body" className="font-normal">
            {t("career.referral.modal.reward_heading", "추천 보상")}
          </Text>
          <p className="mt-2 text-[13px] leading-5 text-neutral-muted">
            {t(
              "career.referral.modal.reward_description",
              "추천한 사람이 Harper를 통해 채용되면 첫해 연봉, 계약 조건, Harper가 실제로 수령한 채용 수수료의 20%를 기준으로 보상을 검토합니다."
            )}
            <br />
            <span className="text-primary">
              {t(
                "career.referral.modal.latest_hire_reward",
                "Harper의 가장 최근 채용건의 보상금: 1,000만원 (초대를 통한 가입으로 가정했을 때)"
              )}
            </span>
          </p>
        </div>
      </div>
      <div className="mt-4 rounded-lg border border-neutral-1000-a05 p-4 shadow-sm">
        <div className="text-[12px] font-medium leading-4 text-neutral-soft">
          {t("career.referral.modal.example_reward_heading", "예시 보상")}
        </div>
        <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[13px] leading-5 text-neutral-muted">
              {t(
                "career.referral.modal.example_basis",
                "연봉 1억원 채용 1건 기준"
              )}
            </div>
            <div className="mt-1 text-[28px] font-semibold leading-8 text-neutral-primary">
              {t("career.referral.modal.average_reward", "평균 300만원")}
            </div>
          </div>
        </div>
        <dl className="mt-4 divide-y divide-neutral-1000-a05 text-[13px] leading-5">
          <div className="flex items-center justify-between gap-4 py-2">
            <dt className="text-neutral-muted">
              {t("career.referral.modal.first_year_salary_label", "첫해 연봉")}
            </dt>
            <dd className="font-medium text-neutral-primary">
              {t("career.referral.modal.example_salary", "1억원")}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-2">
            <dt className="text-neutral-muted">
              {t("career.referral.modal.your_cut_label", "산정 기준")}
            </dt>
            <dd className="text-right font-medium text-neutral-primary">
              {t(
                "career.referral.modal.your_cut_value",
                "Harper에게 지급되는 수수료의 20%"
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-2">
            <dt className="text-neutral-muted">
              {t("career.referral.modal.your_reward_label", "내 보상")}
            </dt>
            <dd className="font-medium text-neutral-primary">
              {t("career.referral.modal.example_reward", "200만원 ~ 400만원")}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-[12px] font-normal leading-5 text-neutral-muted">
          {t(
            "career.referral.modal.reward_note",
            "실제 보상은 약관상 유효 추천 여부와 채용·정산 조건에 따라 달라질 수 있습니다."
          )}
        </p>
      </div>
    </section>
  );
}
