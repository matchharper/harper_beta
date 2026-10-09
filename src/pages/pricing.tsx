import Head from "next/head";
// import { useRouter } from "next/router";
import { useQuery } from "@tanstack/react-query";
import CareerAppBar from "@/components/landing/career/CareerAppBarNew";
import CareerLandingFooter from "@/components/landing/CareerLandingFooter";
import QuestionAnswer from "@/components/landing/Questions";
import { PricingSocialProof } from "@/components/landing/PricingSocialProof";
import { PageContainer } from "@/components/layout/PageContainer";
import { WorkspacePlans } from "@/components/org/billing/WorkspacePlans";
import { useMessages } from "@/i18n/useMessage";
import { getCompanyLocalePath } from "@/lib/companyLandingSeo";
import { openCustomCrispWidget } from "@/lib/feedback/customCrispEvents";
import {
  BILLING_SUPPORT_HREF,
  type BillingCatalog,
} from "@/lib/org/billing/types";

export default function PricingPage() {
  const { locale, setLocale } = useMessages();
  // const router = useRouter();
  const contactHref = `${getCompanyLocalePath(locale)}#company-contact`;
  const c = (ko: string, en: string) => (locale === "ko" ? ko : en);
  const catalog = useQuery({
    queryKey: ["billing-catalog"],
    queryFn: async () => {
      const res = await fetch("/api/billing/catalog");
      if (!res.ok) throw new Error("catalog unavailable");
      return res.json() as Promise<BillingCatalog>;
    },
    staleTime: 60_000,
    retry: 1,
  });
  const faqs = [
    [
      c("결제 없이 먼저 사용해 볼 수 있나요?", "Can I try Harper for free?"),
      c(
        "네. 회사 이메일로 가입하면 카드 등록 없이 시작할 수 있어요. Free에서도 Role을 무제한으로 만들고 채용을 진행할 수 있어요. 모든 Role이 함께 사용하는 공용 크레딧 10개를 매월 제공하며, 후보자 검토와 Intro 요청을 이용할 수 있어요.",
        "Yes. Sign up with your work email, with no card required. Free includes unlimited Roles and 10 monthly credits shared across all Roles. You can review candidates and request introductions."
      ),
    ],
    [
      c(
        "슬롯은 무엇이고, 몇 개가 필요한가요?",
        "What is a slot, and how many do I need?"
      ),
      c(
        "슬롯은 Role 하나에 유료 기능과 월 50크레딧을 연결하는 구독이에요. Role 수는 Free에서도 무제한이므로, 유료 기능이 필요한 Role 수만큼 추가하면 돼요. 슬롯에 연결된 Role은 Harper가 먼저 관심을 확인한 후보자와 연결할 수 있어요. 슬롯의 담당 Role은 변경할 수 있고, 크레딧과 갱신일은 슬롯에 남아요.",
        "A slot adds paid features and 50 monthly credits to one Role. Roles are unlimited even on Free, so add slots for the Roles that need paid features, including connections with candidates whose interest Harper has confirmed. You can reassign a slot; its credits and renewal date stay with it."
      ),
    ],
    [
      c("크레딧은 무엇을 할 때 사용하나요?", "What do credits cover?"),
      c(
        "후보자에게 우리 회사의 채용 기회를 소개해 달라고 요청할 때 1개를 사용해요. 또는 Harper가 먼저 관심을 확인한 후보자를 소개했을 때, 그 후보자와 연결하기로 결정하면 1개를 사용해요. 먼저 소개를 요청한 후보자와 나중에 연결될 때는 추가로 사용하지 않아요. 후보자 정보를 살펴보는 데는 크레딧이 들지 않아요.",
        "You use 1 credit when you ask Harper to introduce your opportunity to a candidate. You also use 1 credit when you choose to connect with a candidate whose interest Harper has already confirmed. If you requested the introduction first, connecting afterwards costs no additional credit. Reviewing candidate profiles does not use credits."
      ),
    ],
    [
      c(
        "크레딧은 언제 새로 받나요? 남으면 이월되나요?",
        "When do credits reset, and do they roll over?"
      ),
      c(
        "전체 Role 공용 크레딧은 매월 10개, 유료 슬롯은 각 슬롯의 월 갱신일에 50개가 제공돼요. 유료 슬롯을 구매해도 공용 크레딧의 잔액과 갱신일은 유지돼요. 슬롯에 연결된 Role은 해당 슬롯의 크레딧을 먼저 쓰고 부족하면 공용 크레딧을 사용해요. 다른 유료 슬롯의 크레딧은 사용할 수 없고, 남은 크레딧은 이월되지 않아요.",
        "All Roles share 10 credits each month. Each paid slot receives 50 credits on its own monthly reset date. Buying slots preserves the shared balance and its reset date. A Role uses its assigned slot’s credits first, then shared credits. It cannot use another paid slot’s credits. Unused credits do not roll over."
      ),
    ],
    [
      c(
        "월간 결제와 연간 결제는 무엇이 다른가요?",
        "How do monthly and yearly billing differ?"
      ),
      c(
        "월간은 한 달 이용료를 매월 결제하고, 연간은 할인된 가격으로 12개월 이용료를 한 번에 결제해요. 이용할 수 있는 기능과 매월 받는 크레딧은 같아요. 연간 결제를 선택해도 크레딧은 1년치를 한꺼번에 받는 것이 아니라 슬롯마다 매월 50개씩 새로 제공돼요.",
        "Monthly plans are billed one month at a time. Yearly plans are paid upfront for 12 months at a discounted rate. Both include the same features and monthly credits. On a yearly plan, each slot still receives 50 new credits every month, rather than a full year’s credits at once."
      ),
    ],
    [
      c(
        "채용에 성공하면 별도 수수료가 있나요?",
        "Is there a fee when I make a hire?"
      ),
      c(
        "Free와 일반 유료 요금제에는 채용 성공보수가 없어요. 후보자를 채용해도 연봉에 따른 수수료나 별도의 성공보수를 청구하지 않아요. Harper에 Enterprise를 요청한 경우에만 별도 계약으로 다른 비용 모델을 정할 수 있으며, 계약 전에 안내해 드려요.",
        "There is no hiring success fee on Free or standard paid plans. You will not be charged a salary-based commission or a separate fee for making a hire. If you request Enterprise, a different pricing model may be agreed in a separate contract and explained before you sign."
      ),
    ],
    [
      c(
        "채용이 끝나면 구독을 취소할 수 있나요?",
        "Can I cancel when I’m done hiring?"
      ),
      c(
        "네. Organization의 Slots에서 필요한 슬롯만 골라 언제든 구독을 취소할 수 있어요. 취소해도 이미 결제한 기간이 끝날 때까지 이용할 수 있고, 다음 자동 결제는 중단돼요. 종료 후에도 모든 Role과 공용 크레딧은 유지돼요. 월간·연간 모두 중도 취소에 따른 잔여 기간 환불은 원칙적으로 제공하지 않아요. 결제 오류나 법령에 따른 환불은 별도로 처리해요.",
        "Yes. In Organization → Slots, you can cancel any slot you no longer need. It stays available until the end of the paid period and will not renew. All Roles and shared credits remain available afterwards. Monthly and yearly subscriptions are generally not refunded for the unused portion when cancelled mid-period. Billing errors and refunds required by law are handled separately."
      ),
    ],
  ];
  return (
    <div
      id="top"
      className="min-h-screen bg-bg-basement font-sans text-neutral-primary"
    >
      <Head>
        <title>{`Harper — ${c("요금제", "Pricing")}`}</title>
        <meta
          name="description"
          content={c(
            "채용에 필요한 만큼 슬롯을 추가하세요. Free, Slot, Enterprise 요금제.",
            "Add hiring slots as your team grows. Free, Slot and Enterprise plans."
          )}
        />
      </Head>
      <CareerAppBar
        // careerStartHref={`/org?lang=${locale}`}
        careerStartHref={contactHref}
        sectionHrefPrefix={getCompanyLocalePath(locale)}
        showSectionLinks={false}
        audienceHref="/"
        bgColor="bg-basement"
        locale={locale}
      />
      <PageContainer
        as="main"
        padding="none"
        className="max-w-[1160px] px-4 pb-24 pt-28 md:pb-32 md:pt-36"
      >
        <header className="mb-10 text-center md:mb-14">
          <h1 className="text-[28px] font-normal leading-snug tracking-tight md:text-[36px]">
            {c(
              "채용에 맞는 요금제를 선택하세요.",
              "A plan for your next hire."
            )}
          </h1>
          <p className="mt-4 text-[15px] font-light leading-7 text-neutral-muted md:text-base">
            {c(
              "무료로 시작하고, 채용이 늘어나면 슬롯을 추가하세요.",
              "Start for free. Add slots as your hiring grows."
            )}
          </p>
        </header>
        <WorkspacePlans
          locale={locale}
          catalog={catalog.data}
          contactHref={contactHref}
          onAddSlot={() => {}}
          // Self-serve checkout preserved until payment testing is complete.
          // onAddSlot={(interval) =>
          //   void router.push(
          //     `/org/slots?purchase=slot&interval=${interval}&lang=${locale}`
          //   )
          // }
        />
        <PricingSocialProof locale={locale} />
        <section
          id="pricing-faq"
          aria-labelledby="pricing-faq-title"
          className="mt-20 scroll-mt-24 md:mt-28"
        >
          <div className="flex flex-col gap-6 md:flex-row md:gap-12">
            <div className="md:w-1/3 md:shrink-0 md:pt-4">
              <h2
                id="pricing-faq-title"
                className="text-[26px] font-normal leading-tight tracking-tight md:text-[28px]"
              >
                {c("자주 묻는 질문", "Frequently asked questions")}
              </h2>
              <p className="mt-5 text-sm font-light leading-6 text-neutral-muted">
                {c("더 궁금한 점이 있으신가요?", "Have another question?")}
                <br />
                <a
                  className="underline decoration-neutral-1000-a10 underline-offset-4 hover:text-neutral-primary"
                  href={BILLING_SUPPORT_HREF}
                >
                  {c("Harper 팀에 문의해 주세요.", "Get in touch with Harper.")}
                </a>
              </p>
            </div>
            <div className="min-w-0 flex-1">
              {faqs.map(([question, answer], index) => (
                <QuestionAnswer
                  key={question}
                  question={question}
                  answer={answer}
                  index={index}
                  length={faqs.length}
                  theme="cream"
                  variant="compact"
                />
              ))}
            </div>
          </div>
        </section>
      </PageContainer>
      <CareerLandingFooter
        careerStartHref={`/career?lang=${locale}`}
        locale={locale}
        onLocaleChange={setLocale}
        onScheduleCallClick={() => openCustomCrispWidget()}
      />
    </div>
  );
}
