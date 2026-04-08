import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCheck,
  CircleHelp,
  CircleX,
  ExternalLink,
  Eye,
  Link2,
  Loader2,
  MapPin,
  MousePointerClick,
  Sparkles,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import CareerInPageTabs from "./CareerInPageTabs";
import {
  CareerInlinePanel,
  CareerPrimaryButton,
  CareerSecondaryButton,
  careerCx,
} from "./ui/CareerPrimitives";
import type {
  CareerHistoryOpportunity,
  CareerHistoryOpportunityFeedback,
} from "./types";

type HistoryTabId = "all" | "accepted" | "tracked" | "not_for_me" | "dont_know";

const HISTORY_TABS: Array<{
  id: HistoryTabId;
  label: string;
  title: string;
  description: string[];
}> = [
  {
    id: "all",
    label: "All",
    title: "기회 전체 보기",
    description: [
      "추천되었거나 연결 가능한 기회를 한 장씩 검토합니다.",
      "좌우 방향키로 이동하고 z / x / c 로 반응을 남길 수 있습니다.",
    ],
  },
  {
    id: "accepted",
    label: "연결 수락",
    title: "연결 수락",
    description: [
      "Harper가 현재 바로 연결을 검토할 수 있는 기회만 모아봅니다.",
      "카드를 누르면 모달에서 상세와 반응을 바로 확인할 수 있습니다.",
    ],
  },
  {
    id: "tracked",
    label: "Tracked",
    title: "Tracked",
    description: [
      "계속 추적하고 싶은 기회입니다.",
      "리스트에서 카드를 눌러 세부 내용을 다시 보고 반응을 바꿀 수 있습니다.",
    ],
  },
  {
    id: "not_for_me",
    label: "Not for me",
    title: "Not for me",
    description: [
      "현재 방향과 맞지 않는다고 남긴 기회입니다.",
      "필요하면 모달에서 다시 열어 반응을 수정할 수 있습니다.",
    ],
  },
  {
    id: "dont_know",
    label: "Don't know",
    title: "Don't know",
    description: [
      "판단을 보류한 기회들입니다.",
      "모달에서 다시 비교해보면서 track / not for me 로 정리할 수 있습니다.",
    ],
  },
];

const shortDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "short",
  day: "numeric",
});

const longDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const formatDate = (value: string | null, formatter = longDateFormatter) => {
  if (!value) return null;

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;
  return formatter.format(new Date(timestamp));
};

const formatEmploymentType = (value: string) => {
  if (value === "full_time") return "Full-time";
  if (value === "part_time") return "Part-time";
  if (value === "internship") return "Internship";
  if (value === "contract") return "Contract";
  if (value === "fractional") return "Fractional";
  return value.replaceAll("_", " ");
};

const formatWorkMode = (value: string | null) => {
  if (value === "remote") return "Remote";
  if (value === "hybrid") return "Hybrid";
  if (value === "onsite") return "On-site";
  return value;
};

const formatFeedback = (value: CareerHistoryOpportunityFeedback | null) => {
  if (value === "tracked") return "Tracked";
  if (value === "dont_know") return "Don't know";
  if (value === "not_for_me") return "Not for me";
  return null;
};

const formatKind = (value: CareerHistoryOpportunity["kind"]) =>
  value === "match" ? "Match" : "Recommendation";

const formatSource = (item: CareerHistoryOpportunity) => {
  if (item.isInternal) return "Harper managed";
  if (item.sourceProvider?.trim()) return item.sourceProvider.trim();
  return "External JD";
};

const getMetaItems = (item: CareerHistoryOpportunity) =>
  [
    item.location,
    formatWorkMode(item.workMode),
    ...item.employmentTypes.map(formatEmploymentType),
  ].filter(Boolean) as string[];

const getFeedbackButtonTone = (active: boolean) =>
  active
    ? "border-beige900 bg-beige200 text-beige900 outline outline-[0.5px] outline-beige900"
    : "border-beige900/15 bg-white/45 text-beige900/70 hover:border-beige900/30 hover:text-beige900";

const getOpportunityPanelTone = (item: CareerHistoryOpportunity) =>
  item.isInternal ? "border-beige900/12 bg-beige100/75" : "";

const isInteractiveTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    Boolean(target.closest("[contenteditable='true']"))
  );
};

const HistoryMetaPill = ({ children }: { children: ReactNode }) => (
  <span className="rounded-full border border-beige900/10 bg-white/55 px-2.5 py-1 text-[12px] leading-5 text-beige900/60">
    {children}
  </span>
);

const HistorySectionTitle = ({
  icon,
  title,
}: {
  icon: ReactNode;
  title: string;
}) => (
  <div className="flex items-center gap-2 text-[14px] font-medium leading-5 text-beige900">
    {icon}
    <span>{title}</span>
  </div>
);

const HistoryFeedbackButton = ({
  active,
  disabled,
  hint,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  hint: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={careerCx(
      "flex min-h-[40px] w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm leading-5 transition-colors disabled:cursor-not-allowed disabled:opacity-60",
      getFeedbackButtonTone(active)
    )}
  >
    <span className="flex items-center gap-2">
      {icon}
      <span>{label}</span>
    </span>
    <span className="text-[12px] text-beige900/45">{hint}</span>
  </button>
);

const OpportunityListCard = ({
  item,
  pending,
  onOpenDetail,
  onOpenLink,
}: {
  item: CareerHistoryOpportunity;
  pending: boolean;
  onOpenDetail: () => void;
  onOpenLink: () => void;
}) => {
  const feedbackLabel = formatFeedback(item.feedback);
  const recommendedAt = formatDate(item.recommendedAt, shortDateFormatter);
  const metaItems = getMetaItems(item);

  return (
    <CareerInlinePanel
      className={careerCx(
        "rounded-[8px] px-4 py-4 transition-colors hover:border-beige900/20",
        getOpportunityPanelTone(item)
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <button
          type="button"
          onClick={onOpenDetail}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex flex-wrap items-center gap-2 text-[12px] leading-5 text-beige900/50">
            <HistoryMetaPill>{item.isInternal ? "내부" : "외부"}</HistoryMetaPill>
            <span>{formatKind(item.kind)}</span>
            {recommendedAt ? <span>{recommendedAt} 추천</span> : null}
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-beige900/35" />
            ) : null}
          </div>

          <div className="mt-3 text-[16px] font-medium leading-6 text-beige900">
            {item.title}
          </div>
          <div className="mt-1 text-[14px] leading-6 text-beige900/55">
            {item.companyName}
          </div>

          {(item.description || item.companyDescription) && (
            <p className="mt-2 line-clamp-3 text-[14px] leading-6 text-beige900/68">
              {item.description ?? item.companyDescription}
            </p>
          )}

          {metaItems.length > 0 || feedbackLabel || item.isAccepted ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {metaItems.map((meta) => (
                <HistoryMetaPill key={`${item.roleId}-${meta}`}>
                  {meta}
                </HistoryMetaPill>
              ))}
              {feedbackLabel ? (
                <HistoryMetaPill>{feedbackLabel}</HistoryMetaPill>
              ) : null}
              {item.isAccepted ? <HistoryMetaPill>연결 수락</HistoryMetaPill> : null}
            </div>
          ) : null}
        </button>

        <div className="flex shrink-0 items-center gap-2">
          {item.href ? (
            <a
              href={item.href}
              target="_blank"
              rel="noreferrer"
              onClick={onOpenLink}
              className="inline-flex h-9 items-center justify-center rounded-md border border-beige900/15 bg-white/45 px-3 text-sm text-beige900/70 transition-colors hover:border-beige900/30 hover:text-beige900"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
          <CareerSecondaryButton onClick={onOpenDetail} className="h-9 px-3">
            보기
          </CareerSecondaryButton>
        </div>
      </div>
    </CareerInlinePanel>
  );
};

const HistoryShortcutPanel = ({
  activeIndex,
  totalCount,
  onNext,
  onPrev,
}: {
  activeIndex: number;
  totalCount: number;
  onNext: () => void;
  onPrev: () => void;
}) => (
  <CareerInlinePanel className="px-4 py-4">
    <div className="space-y-3">
      <div className="text-[13px] leading-5 text-beige900/50">Shortcut</div>
      <div className="space-y-2 text-[13px] leading-5 text-beige900/70">
        <div>← 이전 기회</div>
        <div>→ 다음 기회</div>
        <div>Z Track</div>
        <div>X Don&apos;t know</div>
        <div>C Not for me</div>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <CareerSecondaryButton
          onClick={onPrev}
          disabled={activeIndex <= 0}
          className="h-9 flex-1 gap-2 px-3"
        >
          <ArrowLeft className="h-4 w-4" />
          Prev
        </CareerSecondaryButton>
        <CareerSecondaryButton
          onClick={onNext}
          disabled={activeIndex >= totalCount - 1}
          className="h-9 flex-1 gap-2 px-3"
        >
          Next
          <ArrowRight className="h-4 w-4" />
        </CareerSecondaryButton>
      </div>
    </div>
  </CareerInlinePanel>
);

const HistoryReactionPanel = ({
  item,
  pending,
  onSetFeedback,
}: {
  item: CareerHistoryOpportunity;
  pending: boolean;
  onSetFeedback: (feedback: CareerHistoryOpportunityFeedback) => void;
}) => (
  <CareerInlinePanel className="px-4 py-4">
    <HistorySectionTitle
      icon={<CheckCheck className="h-4 w-4" />}
      title="반응"
    />
    <div className="mt-4 space-y-2">
      <HistoryFeedbackButton
        active={item.feedback === "tracked"}
        disabled={pending}
        hint="Z"
        icon={<CheckCheck className="h-4 w-4" />}
        label="Track"
        onClick={() => onSetFeedback("tracked")}
      />
      <HistoryFeedbackButton
        active={item.feedback === "dont_know"}
        disabled={pending}
        hint="X"
        icon={<CircleHelp className="h-4 w-4" />}
        label="Don't know"
        onClick={() => onSetFeedback("dont_know")}
      />
      <HistoryFeedbackButton
        active={item.feedback === "not_for_me"}
        disabled={pending}
        hint="C"
        icon={<CircleX className="h-4 w-4" />}
        label="Not for me"
        onClick={() => onSetFeedback("not_for_me")}
      />
    </div>
  </CareerInlinePanel>
);

const HistoryStatusPanel = ({
  item,
  onOpenLink,
}: {
  item: CareerHistoryOpportunity;
  onOpenLink: () => void;
}) => {
  const activeFeedbackLabel = formatFeedback(item.feedback);

  return (
    <CareerInlinePanel className="px-4 py-4">
      <HistorySectionTitle icon={<Eye className="h-4 w-4" />} title="상태" />
      <div className="mt-4 space-y-2 text-[13px] leading-5 text-beige900/60">
        <div className="flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5" />
          <span>{item.location ?? "위치 미정"}</span>
        </div>
        {activeFeedbackLabel ? (
          <div className="flex items-center gap-2">
            <CheckCheck className="h-3.5 w-3.5" />
            <span>{activeFeedbackLabel}</span>
          </div>
        ) : null}
        {formatDate(item.feedbackAt, dateTimeFormatter) ? (
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5" />
            <span>{formatDate(item.feedbackAt, dateTimeFormatter)}</span>
          </div>
        ) : null}
        {formatDate(item.viewedAt, dateTimeFormatter) ? (
          <div className="flex items-center gap-2">
            <Eye className="h-3.5 w-3.5" />
            <span>{formatDate(item.viewedAt, dateTimeFormatter)}</span>
          </div>
        ) : null}
        {formatDate(item.clickedAt, dateTimeFormatter) ? (
          <div className="flex items-center gap-2">
            <MousePointerClick className="h-3.5 w-3.5" />
            <span>{formatDate(item.clickedAt, dateTimeFormatter)}</span>
          </div>
        ) : null}
      </div>

      {item.href ? (
        <CareerPrimaryButton
          onClick={onOpenLink}
          className="mt-4 h-10 w-full gap-2"
        >
          {item.isInternal ? "회사 보기" : "JD 보기"}
          <ExternalLink className="h-4 w-4" />
        </CareerPrimaryButton>
      ) : null}
    </CareerInlinePanel>
  );
};

const HistoryOpportunityDetailContent = ({
  item,
  pending,
  onOpenInlineLink,
  onOpenLink,
  onSetFeedback,
}: {
  item: CareerHistoryOpportunity;
  pending: boolean;
  onOpenInlineLink: () => void;
  onOpenLink: () => void;
  onSetFeedback: (feedback: CareerHistoryOpportunityFeedback) => void;
}) => {
  const metaItems = getMetaItems(item);

  return (
    <div className="space-y-4">
      <CareerInlinePanel
        className={careerCx("rounded-[8px] px-5 py-5", getOpportunityPanelTone(item))}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[12px] leading-5 text-beige900/50">
              <HistoryMetaPill>
                {item.isInternal ? "내부 기회" : "외부 JD"}
              </HistoryMetaPill>
              <span>{formatKind(item.kind)}</span>
              {item.isAccepted ? <HistoryMetaPill>연결 수락</HistoryMetaPill> : null}
              {formatDate(item.recommendedAt, shortDateFormatter) ? (
                <span>
                  {formatDate(item.recommendedAt, shortDateFormatter)} 추천
                </span>
              ) : null}
            </div>

            <div className="mt-4 text-[18px] font-medium leading-6 text-beige900">
              {item.title}
            </div>
            <div className="mt-1 text-[14px] leading-6 text-beige900/58">
              {item.companyName}
            </div>

            {metaItems.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {metaItems.map((meta) => (
                  <HistoryMetaPill key={`${item.roleId}-${meta}`}>
                    {meta}
                  </HistoryMetaPill>
                ))}
              </div>
            ) : null}

            <div className="mt-5 border-t border-beige900/10 pt-4 text-[14px] leading-6 text-beige900/72">
              {item.description?.trim() || "아직 상세 역할 설명이 정리되지 않았습니다."}
            </div>
          </div>

          {item.href ? (
            <a
              href={item.href}
              target="_blank"
              rel="noreferrer"
              onClick={onOpenInlineLink}
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-beige900/15 bg-white/45 px-3 text-sm text-beige900/70 transition-colors hover:border-beige900/30 hover:text-beige900"
            >
              {item.isInternal ? "회사 보기" : "JD 보기"}
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
        </div>
      </CareerInlinePanel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-4">
          <CareerInlinePanel className="px-5 py-5">
            <HistorySectionTitle
              icon={<Sparkles className="h-4 w-4" />}
              title="추천 이유"
            />
            {item.recommendationReasons.length > 0 ? (
              <div className="mt-4 space-y-2">
                {item.recommendationReasons.map((reason, index) => (
                  <div
                    key={`${item.roleId}-${index}`}
                    className="rounded-[8px] border border-beige900/10 bg-white/40 px-4 py-3 text-[14px] leading-6 text-beige900/72"
                  >
                    {reason}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-[8px] border border-dashed border-beige900/12 bg-white/30 px-4 py-3 text-[14px] leading-6 text-beige900/45">
                아직 저장된 추천 이유가 없습니다.
              </div>
            )}
          </CareerInlinePanel>

          <CareerInlinePanel
            className={careerCx("px-5 py-5", getOpportunityPanelTone(item))}
          >
            <HistorySectionTitle
              icon={<Building2 className="h-4 w-4" />}
              title={item.isInternal ? "회사 정보" : "회사 / 출처"}
            />

            <div className="mt-4 space-y-4">
              <div className="text-[14px] leading-6 text-beige900/72">
                {item.companyDescription?.trim() || "아직 회사 설명이 없습니다."}
              </div>

              <div className="grid gap-2 text-[13px] leading-5 text-beige900/60">
                <div className="flex items-center gap-2">
                  <Link2 className="h-3.5 w-3.5" />
                  <span>{formatSource(item)}</span>
                </div>
                {item.sourceJobId ? <div>{item.sourceJobId}</div> : null}
                {formatDate(item.postedAt) ? (
                  <div>게시일 {formatDate(item.postedAt)}</div>
                ) : null}
              </div>
            </div>
          </CareerInlinePanel>
        </div>

        <div className="space-y-4">
          <HistoryReactionPanel
            item={item}
            pending={pending}
            onSetFeedback={onSetFeedback}
          />
          <HistoryStatusPanel item={item} onOpenLink={onOpenLink} />
        </div>
      </div>
    </div>
  );
};

const HistoryOpportunityModal = ({
  item,
  open,
  pending,
  onClose,
  onOpenInlineLink,
  onOpenLink,
  onSetFeedback,
}: {
  item: CareerHistoryOpportunity | null;
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onOpenInlineLink: () => void;
  onOpenLink: () => void;
  onSetFeedback: (feedback: CareerHistoryOpportunityFeedback) => void;
}) => {
  if (!open || !item) return null;

  return (
    <TalentCareerModal
      open={open}
      onClose={onClose}
      ariaLabel={`${item.title} 상세`}
      overlayClassName="items-start pt-10"
      panelClassName="max-w-none w-[min(1160px,94vw)] border border-beige900/10 bg-beige50"
      bodyClassName="max-h-[82vh] overflow-y-auto bg-beige50 px-5 py-5"
      closeButtonClassName="font-geist right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-beige900/10 bg-white/70 text-beige900/70 transition-colors hover:border-beige900/25 hover:text-beige900"
    >
      <HistoryOpportunityDetailContent
        item={item}
        pending={pending}
        onOpenInlineLink={onOpenInlineLink}
        onOpenLink={onOpenLink}
        onSetFeedback={onSetFeedback}
      />
    </TalentCareerModal>
  );
};

const CareerHistoryPanel = () => {
  const {
    historyOpportunities,
    historyUpdatingRoleIds,
    historyUpdateError,
    onUpdateHistoryOpportunityFeedback,
    onMarkHistoryOpportunityViewed,
    onMarkHistoryOpportunityClicked,
  } = useCareerSidebarContext();
  const [activeTab, setActiveTab] = useState<HistoryTabId>("all");
  const [activeRoleId, setActiveRoleId] = useState<string | null>(null);
  const [modalRoleId, setModalRoleId] = useState<string | null>(null);

  const sortedOpportunities = useMemo(
    () =>
      [...historyOpportunities].sort(
        (left, right) =>
          Date.parse(right.recommendedAt) - Date.parse(left.recommendedAt)
      ),
    [historyOpportunities]
  );

  const acceptedItems = useMemo(
    () => sortedOpportunities.filter((item) => item.isAccepted),
    [sortedOpportunities]
  );
  const trackedItems = useMemo(
    () => sortedOpportunities.filter((item) => item.feedback === "tracked"),
    [sortedOpportunities]
  );
  const notForMeItems = useMemo(
    () => sortedOpportunities.filter((item) => item.feedback === "not_for_me"),
    [sortedOpportunities]
  );
  const dontKnowItems = useMemo(
    () => sortedOpportunities.filter((item) => item.feedback === "dont_know"),
    [sortedOpportunities]
  );

  useEffect(() => {
    if (sortedOpportunities.length === 0) {
      setActiveRoleId(null);
      return;
    }

    if (
      !activeRoleId ||
      !sortedOpportunities.some((item) => item.roleId === activeRoleId)
    ) {
      setActiveRoleId(sortedOpportunities[0]?.roleId ?? null);
    }
  }, [activeRoleId, sortedOpportunities]);

  useEffect(() => {
    if (!modalRoleId) return;
    if (sortedOpportunities.some((item) => item.roleId === modalRoleId)) return;
    setModalRoleId(null);
  }, [modalRoleId, sortedOpportunities]);

  useEffect(() => {
    if (activeTab === "all") {
      setModalRoleId(null);
    }
  }, [activeTab]);

  const activeIndex = useMemo(
    () => sortedOpportunities.findIndex((item) => item.roleId === activeRoleId),
    [activeRoleId, sortedOpportunities]
  );

  const activeOpportunity =
    activeIndex >= 0 ? sortedOpportunities[activeIndex] : null;

  const modalOpportunity = useMemo(
    () =>
      sortedOpportunities.find((item) => item.roleId === modalRoleId) ?? null,
    [modalRoleId, sortedOpportunities]
  );

  useEffect(() => {
    if (activeTab !== "all" || !activeOpportunity || activeOpportunity.viewedAt) {
      return;
    }

    void onMarkHistoryOpportunityViewed(activeOpportunity.roleId);
  }, [activeOpportunity, activeTab, onMarkHistoryOpportunityViewed]);

  useEffect(() => {
    if (activeTab === "all" || !modalOpportunity || modalOpportunity.viewedAt) {
      return;
    }

    void onMarkHistoryOpportunityViewed(modalOpportunity.roleId);
  }, [activeTab, modalOpportunity, onMarkHistoryOpportunityViewed]);

  const moveActiveOpportunity = useCallback(
    (direction: -1 | 1) => {
      if (sortedOpportunities.length === 0) return;

      const baseIndex = activeIndex >= 0 ? activeIndex : 0;
      const nextIndex = Math.min(
        sortedOpportunities.length - 1,
        Math.max(0, baseIndex + direction)
      );
      const nextRoleId = sortedOpportunities[nextIndex]?.roleId ?? null;
      if (nextRoleId) {
        setActiveRoleId(nextRoleId);
      }
    },
    [activeIndex, sortedOpportunities]
  );

  const updateFeedbackForRole = useCallback(
    (roleId: string, feedback: CareerHistoryOpportunityFeedback) => {
      void onUpdateHistoryOpportunityFeedback(roleId, feedback);
    },
    [onUpdateHistoryOpportunityFeedback]
  );

  const markOpportunityClicked = useCallback(
    (roleId: string) => {
      void onMarkHistoryOpportunityClicked(roleId);
    },
    [onMarkHistoryOpportunityClicked]
  );

  const openOpportunityLink = useCallback(
    (item: CareerHistoryOpportunity) => {
      const href = item.href;
      if (!href) return;

      void onMarkHistoryOpportunityClicked(item.roleId);
      window.open(href, "_blank", "noopener,noreferrer");
    },
    [onMarkHistoryOpportunityClicked]
  );

  useEffect(() => {
    if (activeTab !== "all") return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isInteractiveTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const key = event.key.toLowerCase();

      if (key === "arrowleft") {
        event.preventDefault();
        moveActiveOpportunity(-1);
        return;
      }

      if (key === "arrowright") {
        event.preventDefault();
        moveActiveOpportunity(1);
        return;
      }

      if (!activeOpportunity) return;

      if (key === "z") {
        event.preventDefault();
        updateFeedbackForRole(activeOpportunity.roleId, "tracked");
        return;
      }

      if (key === "x") {
        event.preventDefault();
        updateFeedbackForRole(activeOpportunity.roleId, "dont_know");
        return;
      }

      if (key === "c") {
        event.preventDefault();
        updateFeedbackForRole(activeOpportunity.roleId, "not_for_me");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeOpportunity, activeTab, moveActiveOpportunity, updateFeedbackForRole]);

  useEffect(() => {
    if (activeTab === "all" || !modalOpportunity) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isInteractiveTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        updateFeedbackForRole(modalOpportunity.roleId, "tracked");
        return;
      }

      if (key === "x") {
        event.preventDefault();
        updateFeedbackForRole(modalOpportunity.roleId, "dont_know");
        return;
      }

      if (key === "c") {
        event.preventDefault();
        updateFeedbackForRole(modalOpportunity.roleId, "not_for_me");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, modalOpportunity, updateFeedbackForRole]);

  const tabs = useMemo(
    () => HISTORY_TABS.map(({ id, label }) => ({ id, label })),
    []
  );
  const activeSection =
    HISTORY_TABS.find((item) => item.id === activeTab) ?? HISTORY_TABS[0];
  const pendingRoleIds = new Set(historyUpdatingRoleIds);

  const listItems =
    activeTab === "accepted"
      ? acceptedItems
      : activeTab === "tracked"
        ? trackedItems
        : activeTab === "not_for_me"
          ? notForMeItems
          : dontKnowItems;

  if (sortedOpportunities.length === 0) {
    return (
      <section className="border border-beige900/10 bg-white/40 px-5 py-6">
        <div className="text-[15px] leading-6 text-beige900/45">
          아직 표시할 기회가 없습니다.
        </div>
      </section>
    );
  }

  return (
    <>
      <div className="sticky top-0 z-20 mt-8 backdrop-blur">
        <CareerInPageTabs
          items={tabs}
          activeId={activeTab}
          onChange={setActiveTab}
        />
      </div>

      <div className="mt-6 flex flex-row gap-6 py-6">
        <div className="w-[264px] shrink-0 pr-4">
          <div className="flex flex-col gap-2">
            <h3 className="text-lg font-medium leading-5">
              {activeSection.title}
            </h3>
            {activeSection.description.map((item, index) => (
              <p key={index} className="mt-1 text-sm font-normal text-black/70">
                {item}
              </p>
            ))}
          </div>

          <div className="mt-5 space-y-3">
            {activeTab === "all" && activeOpportunity ? (
              <HistoryShortcutPanel
                activeIndex={activeIndex}
                totalCount={sortedOpportunities.length}
                onNext={() => moveActiveOpportunity(1)}
                onPrev={() => moveActiveOpportunity(-1)}
              />
            ) : (
              <CareerInlinePanel className="px-4 py-4">
                <div className="text-[13px] leading-6 text-beige900/60">
                  리스트에서 카드를 누르면 현재 탭을 유지한 채 상세 모달이 열립니다.
                </div>
              </CareerInlinePanel>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {historyUpdateError ? (
            <div className="mb-4 rounded-[8px] border border-[#7c2d12]/15 bg-[#7c2d12]/5 px-4 py-3 text-sm text-[#7c2d12]">
              {historyUpdateError}
            </div>
          ) : null}

          {activeTab === "all" ? (
            activeOpportunity ? (
              <HistoryOpportunityDetailContent
                item={activeOpportunity}
                pending={pendingRoleIds.has(activeOpportunity.roleId)}
                onOpenInlineLink={() => markOpportunityClicked(activeOpportunity.roleId)}
                onOpenLink={() => openOpportunityLink(activeOpportunity)}
                onSetFeedback={(feedback) =>
                  updateFeedbackForRole(activeOpportunity.roleId, feedback)
                }
              />
            ) : null
          ) : listItems.length > 0 ? (
            <div className="max-h-[calc(100vh-260px)] space-y-3 overflow-y-auto pr-1">
              {listItems.map((item) => (
                <OpportunityListCard
                  key={item.roleId}
                  item={item}
                  pending={pendingRoleIds.has(item.roleId)}
                  onOpenDetail={() => setModalRoleId(item.roleId)}
                  onOpenLink={() => {
                    markOpportunityClicked(item.roleId);
                  }}
                />
              ))}
            </div>
          ) : (
            <CareerInlinePanel className="px-5 py-5">
              <div className="text-[14px] leading-6 text-beige900/48">
                이 탭에 해당하는 기회가 아직 없습니다.
              </div>
            </CareerInlinePanel>
          )}
        </div>
      </div>

      <HistoryOpportunityModal
        open={Boolean(modalOpportunity && activeTab !== "all")}
        item={modalOpportunity}
        pending={modalOpportunity ? pendingRoleIds.has(modalOpportunity.roleId) : false}
        onClose={() => setModalRoleId(null)}
        onOpenInlineLink={() => {
          if (!modalOpportunity) return;
          markOpportunityClicked(modalOpportunity.roleId);
        }}
        onOpenLink={() => {
          if (!modalOpportunity) return;
          openOpportunityLink(modalOpportunity);
        }}
        onSetFeedback={(feedback) => {
          if (!modalOpportunity) return;
          updateFeedbackForRole(modalOpportunity.roleId, feedback);
        }}
      />
    </>
  );
};

export default CareerHistoryPanel;
