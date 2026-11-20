import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Check, ChevronRight } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import RichText from "@/components/ui/rich-text";
import { Skeleton } from "@/components/ui/skeleton";
import { TabBoxes } from "@/components/ui/tab-boxes";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import type {
  CareerInlineCardCompany,
  CareerInlineCardRecord,
} from "@/lib/career/inlineCard";
import type {
  CareerInlineCard as CareerInlineCardReference,
  CareerInlineCardButton,
} from "@/lib/career/inlineUi";
import { HIRING_SIGNAL_LABEL } from "@/lib/career/companies/labels";
import { formatCareerLocation } from "@/lib/career/locationDisplay";
import { cn } from "@/lib/utils";
import type { CareerHistoryOpportunity } from "../../types";
import type { CareerInlineUiRuntime } from "./CareerInlineUi";

const HIGHLIGHTS_TAB = "__card_items__";
const surface = "career-glass w-full min-w-0 p-4 sm:px-[18px] sm:py-4";

const formatCheckedDate = (value: string | null, locale: string) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
};

const hostname = (url: string | null) => {
  if (!url) return "";
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** The overview first, then hiring signals, then other saved topics. */
const topicRank = (label: string) =>
  label === "summary" ? 0 : label === HIRING_SIGNAL_LABEL ? 1 : 2;

function Logo({ url }: { url: string | null | undefined }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-white/80 ring-1 ring-stroke-subtle">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className="size-full object-contain" loading="lazy" src={url} />
      ) : (
        <Building2 aria-hidden className="size-4 text-neutral-muted" />
      )}
    </span>
  );
}

function Items({ items }: { items: CareerInlineCardReference["items"] }) {
  return (
    <dl className="space-y-3.5">
      {items.map((item, index) => (
        <div key={index} className="min-w-0">
          {item.label ? (
            <dt className="text-[13px] leading-5 text-neutral-muted">
              {item.label}
            </dt>
          ) : null}
          <dd className="mt-0.5 min-w-0">
            <RichText
              variant="career"
              content={item.content}
              className="text-[14px] leading-6 text-neutral-primary [overflow-wrap:anywhere]"
            />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Long research stays folded to a preview until the person opens it. */
function Folded({ children }: { children: ReactNode }) {
  const t = useCareerT();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const measure = () =>
      setOverflows(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [open]);
  const folded = !open && overflows;
  return (
    <div>
      <div
        ref={ref}
        className={cn(
          !open && "max-h-[260px] overflow-hidden",
          folded &&
            "[mask-image:linear-gradient(to_bottom,black_65%,transparent)]"
        )}
      >
        {children}
      </div>
      {overflows || open ? (
        <MuteButton
          size="sm"
          variant="transparent"
          className="mt-1 -ml-[7px]"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open
            ? t("career.chat.inline_ui.card.show_less", "접기")
            : t(
                "career.history.opportunity_recommendation_preview.show_more",
                "더보기"
              )}
        </MuteButton>
      ) : null}
    </div>
  );
}

function Topic({
  topic,
}: {
  topic: CareerInlineCardCompany["topics"][number];
}) {
  const t = useCareerT();
  const { locale } = useMessages();
  return (
    <Folded>
      <div className="space-y-5">
        {topic.entries.map((entry, index) => {
          const checked = formatCheckedDate(entry.checkedAt, locale);
          return (
            <div key={index} className="min-w-0">
              {checked ? (
                <div className="mb-2 inline-flex rounded-full bg-neutral-1000-a05 px-2.5 py-1 text-[12px] leading-none text-neutral-muted">
                  {t("career.company.snapshot.investigation_date", "조사일")}{" "}
                  {checked}
                </div>
              ) : null}
              <RichText
                variant="career"
                content={entry.content}
                referenceLinks
                className="max-w-full text-[14px] leading-6 text-neutral-primary/85 [overflow-wrap:anywhere] [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto"
              />
            </div>
          );
        })}
      </div>
    </Folded>
  );
}

function CardButton({
  button,
  dark,
  chosen,
  done,
  onClick,
}: {
  button: CareerInlineCardButton;
  dark?: boolean;
  chosen: boolean;
  done: boolean;
  onClick: () => void;
}) {
  return (
    <MuteButton
      variant={dark ? "dark" : "neutral"}
      disabled={done}
      aria-pressed={done ? chosen : undefined}
      className={cn(
        "min-w-0 flex-1 sm:min-w-[72px] sm:flex-none",
        chosen && "disabled:opacity-100"
      )}
      onClick={onClick}
    >
      {chosen ? <Check aria-hidden className="size-3.5" /> : null}
      {button.label}
    </MuteButton>
  );
}

export default function CareerInlineCard({
  card,
  runtime,
}: {
  card: CareerInlineCardReference;
  runtime: CareerInlineUiRuntime;
}) {
  const t = useCareerT();
  const { locale } = useMessages();
  const [tab, setTab] = useState(HIGHLIGHTS_TAB);
  const [chosen, setChosen] = useState<"negative" | "positive" | null>(null);
  const query = useQuery({
    queryKey: [
      "career-inline-card",
      runtime.userId,
      card.roleId ?? null,
      card.companyId ?? null,
      locale,
    ],
    enabled: Boolean(card.roleId || card.companyId),
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ locale });
      if (card.roleId) params.set("roleId", card.roleId);
      if (card.companyId) params.set("companyId", card.companyId);
      const response = await runtime.fetchWithAuth(
        `/api/talent/inline-card?${params}`,
        { signal }
      );
      if (!response.ok) throw new Error("Card record unavailable");
      return (await response.json()) as CareerInlineCardRecord<CareerHistoryOpportunity>;
    },
  });
  const role = query.data?.role ?? null;
  const company = query.data?.company ?? null;
  const topics = useMemo(
    () =>
      [...(company?.topics ?? [])].sort(
        (a, b) =>
          topicRank(a.label) - topicRank(b.label) ||
          a.label.localeCompare(b.label)
      ),
    [company]
  );

  // Record-based defaults name the target, so the reply reads on its own.
  const roleTitle = role?.title?.trim() || "";
  const companyName = role?.companyName || company?.name || "";
  const values = { company: companyName, title: roleTitle };
  const recordTitle = role ? roleTitle || role.companyName : company?.name;
  const title = card.title || recordTitle || "";
  const subtitle = role
    ? [roleTitle ? role.companyName : "", formatCareerLocation(role.location, locale)].filter(Boolean).join(" · ")
    : company && !card.roleId
      ? hostname(company.website)
      : "";
  const roleMessage = Boolean(role && roleTitle);
  const defaults =
    companyName && (role || company)
      ? {
          positive: {
            label: t("career.chat.inline_ui.card.interested", "관심 있어요"),
            message: roleMessage
              ? t("career.chat.inline_ui.card.role_interested_message", "{company}의 {title} 포지션에 관심 있어요.", { values })
              : t("career.chat.inline_ui.card.company_interested_message", "{company}에 관심 있어요.", { values }),
          },
          negative: {
            label: t("career.chat.inline_ui.card.pass", "넘길게요"),
            message: roleMessage
              ? t("career.chat.inline_ui.card.role_pass_message", "{company}의 {title} 포지션은 이번엔 넘길게요.", { values })
              : t("career.chat.inline_ui.card.company_pass_message", "{company} 쪽은 이번엔 넘길게요.", { values }),
          },
        }
      : null;
  const negative = card.negative ?? defaults?.negative;
  const positive = card.positive ?? defaults?.positive;

  const loading = query.isPending && Boolean(card.roleId || card.companyId);
  if (!loading && !title && !card.items.length && !topics.length)
    return (
      <p role="status" className={`${surface} text-sm text-neutral-muted`}>
        {t("career.chat.inline_ui.unavailable", "이 내용을 표시할 수 없어요.")}
      </p>
    );

  const tabs = [
    ...(card.items.length
      ? [{ value: HIGHLIGHTS_TAB, label: t("career.chat.inline_ui.card.highlights", "핵심") }]
      : []),
    ...topics.map((topic) => ({
      value: topic.label,
      label:
        topic.label === "summary"
          ? t("career.chat.inline_ui.card.topic_summary", "회사 개요")
          : topic.label === HIRING_SIGNAL_LABEL
            ? t("career.chat.inline_ui.card.topic_hiring_signal", "채용 신호")
            : topic.label,
    })),
  ];
  const activeTab = tabs.some((item) => item.value === tab)
    ? tab
    : (tabs[0]?.value ?? HIGHLIGHTS_TAB);
  const activeTopic = topics.find((topic) => topic.label === activeTab);
  const send = (side: "negative" | "positive", button: CareerInlineCardButton) => {
    if (chosen || !runtime.onSendMessage) return;
    setChosen(side);
    void runtime.onSendMessage(button.message);
  };
  const showLogo = loading || Boolean(role || company);
  const done = chosen !== null;

  return (
    <section
      aria-label={title || undefined}
      className={surface}
      data-career-inline-card={card.roleId ? "role" : card.companyId ? "company" : "content"}
    >
      {title || loading ? (
        <header className="flex items-center gap-3">
          {showLogo ? (
            loading && !role && !company ? (
              <Skeleton className="size-9 shrink-0 rounded-[9px]" />
            ) : (
              <Logo url={role?.companyLogoUrl ?? company?.logoUrl} />
            )
          ) : null}
          <div className="min-w-0 flex-1">
            {title ? (
              <h3 className="text-[15px] font-medium leading-6 text-neutral-primary [overflow-wrap:anywhere]">
                {title}
              </h3>
            ) : (
              <Skeleton className="h-5 w-1/2 rounded" />
            )}
            {subtitle ? (
              <p className="truncate text-xs leading-5 text-neutral-muted">
                {subtitle}
              </p>
            ) : null}
          </div>
          {role ? (
            <MuteButton
              size="sm"
              variant="transparent"
              aria-label={t("career.chat.inline_ui.card.open_detail", "자세히 보기")}
              onClick={() => runtime.onOpen(role)}
            >
              <ChevronRight className="size-4" />
            </MuteButton>
          ) : null}
        </header>
      ) : null}
      {tabs.length > 1 ? (
        <TabBoxes
          className={title || loading ? "mt-4" : undefined}
          activeValue={activeTab}
          onValueChange={setTab}
          items={tabs}
          size="sm"
          variant="neutral"
          animateSelection
        />
      ) : null}
      {activeTab === HIGHLIGHTS_TAB && card.items.length ? (
        <div className={cn(title || loading || tabs.length > 1 ? "mt-4" : undefined)}>
          <Items items={card.items} />
        </div>
      ) : activeTopic ? (
        <div className="mt-4">
          <Topic topic={activeTopic} />
        </div>
      ) : null}
      {runtime.onSendMessage && (negative || positive) ? (
        <div className="mt-4 flex gap-2 sm:justify-end">
          {negative ? (
            <CardButton
              button={negative}
              chosen={chosen === "negative"}
              done={done}
              onClick={() => send("negative", negative)}
            />
          ) : null}
          {positive ? (
            <CardButton
              button={positive}
              dark
              chosen={chosen === "positive"}
              done={done}
              onClick={() => send("positive", positive)}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
