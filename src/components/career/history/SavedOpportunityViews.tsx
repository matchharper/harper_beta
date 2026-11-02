import { LayoutGrid, PanelsTopLeft, Table2 } from "lucide-react";
import { memo } from "react";
import { MuteButton } from "@/components/ui/button";
import { ClickablePanel } from "@/components/ui/clickable-panel";
import { Tabs } from "@/components/ui/tabs";
import { Typography } from "@/components/ui/typography";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import { formatRelativeTime, cn } from "@/lib/utils";
import { formatCareerLocation } from "@/lib/career/locationDisplay";
import { useCareerWorkspaceUiStore } from "@/store/useCareerWorkspaceUiStore";
import { CompanyLogo } from "../watchlist/CompanyLogo";
import { formatEmploymentType, formatWorkMode } from "../CareerHistoryPanel";
import type { CareerHistoryOpportunity } from "../types";
import {
  getOpportunityDeadlineLabel,
  isCareerHistoryOpportunityExpired,
} from "./opportunityPostingStatus";

export type SavedOpportunityView = "card1" | "card2" | "table";

export function SavedOpportunityViewPicker() {
  const t = useCareerT();
  const view = useCareerWorkspaceUiStore((s) => s.savedOpportunityView);
  const setView = useCareerWorkspaceUiStore((s) => s.setSavedOpportunityView);
  return (
    <Tabs
      size="small"
      variant="pills"
      className="w-fit"
      activeValue={view}
      aria-label={t("career.history.views.label", "보기 방식")}
      onValueChange={(value) => setView(value as SavedOpportunityView)}
      items={[
        {
          value: "card1",
          label: t("career.history.views.card1", "카드뷰 1"),
          icon: <LayoutGrid strokeWidth={1.5} className="size-3.5" />,
        },
        {
          value: "card2",
          label: t("career.history.views.card2", "카드뷰 2"),
          icon: <PanelsTopLeft strokeWidth={1.5} className="size-3.5" />,
        },
        {
          value: "table",
          label: t("career.history.views.table", "테이블"),
          icon: <Table2 strokeWidth={1.5} className="size-3.5" />,
        },
      ]}
    />
  );
}

// Stable, scattered colors keep a position recognizable across view changes.
const cardColors = [
  "#f6f2fc",
  "#fcf1df",
  "#f3f8e7",
  "#fcfae9",
  "#eff4fb",
  "#f8eeee",
];
export function savedOpportunityColor(id: string) {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return cardColors[(hash >>> 0) % cardColors.length];
}

function usePostingCopy(item: CareerHistoryOpportunity) {
  const t = useCareerT();
  const { locale } = useMessages();
  const expired =
    isCareerHistoryOpportunityExpired(item) || item.status === "deleted";
  const postedAgo = formatRelativeTime(item.postedAt, locale);
  const workMode = /^(on[-_ ]?site)$/i.test(item.workMode?.trim() ?? "")
    ? null
    : item.workMode;
  return {
    expired,
    location: formatCareerLocation(item.location, locale),
    tags: [
      ...item.employmentTypes.map((value) => formatEmploymentType(value, t)),
      formatWorkMode(workMode ?? null, t),
    ].filter(Boolean) as string[],
    posted: postedAgo
      ? t(
          "career.history.my_opportunities.posted_ago",
          "{postedAgo}에 게시됨",
          { values: { postedAgo } }
        )
      : null,
    deadline: expired
      ? t("career.history.posting.closed", "마감됨")
      : getOpportunityDeadlineLabel(item, locale, t),
  };
}

type ItemProps = {
  item: CareerHistoryOpportunity;
  pending: boolean;
  onOpenDetail: (item: CareerHistoryOpportunity) => void;
  onApply: (item: CareerHistoryOpportunity) => void;
};

export const SavedOpportunityCard = memo(function SavedOpportunityCard({
  item,
  pending,
  onOpenDetail,
  onApply,
  view,
}: ItemProps & { view: "card1" | "card2" }) {
  const t = useCareerT();
  const copy = usePostingCopy(item);
  const apply = (
    <MuteButton
      variant="dark"
      size="sm"
      className={view === "card2" ? "shrink-0 rounded-full" : "shrink-0"}
      disabled={pending || copy.expired}
      onClick={() => onApply(item)}
    >
      {t("career.history.external_application.apply", "지원하기")}
    </MuteButton>
  );

  if (view === "card2")
    return (
      <article
        className={cn(
          "flex min-w-0 flex-col overflow-hidden rounded-2xl border border-neutral-1000-a05 bg-bg-floating p-1",
          pending && "opacity-60"
        )}
      >
        <ClickablePanel
          aria-label={`${item.title} · ${item.companyName}`}
          onActivate={() => onOpenDetail(item)}
          className="flex min-h-[160px] flex-1 cursor-pointer flex-col rounded-t-xl px-4 pb-3 pt-5 transition-[filter] hover:brightness-[0.985]"
          style={{
            backgroundColor: savedOpportunityColor(item.roleId || item.id),
          }}
        >
          <Typography
            as="h3"
            variant="title-lg"
            className="mb-5 whitespace-normal wrap-break-word font-normal"
          >
            {item.title}
          </Typography>
          <div className="mt-auto flex flex-wrap items-end justify-between gap-x-3 gap-y-1 text-[11px] leading-5 text-neutral-muted">
            <span>{copy.posted}</span>
            <span>{copy.deadline}</span>
          </div>
        </ClickablePanel>
        <footer className="flex min-h-[56px] items-center gap-2 px-2 py-2.5">
          <CompanyLogo
            logoUrl={item.companyLogoUrl}
            name={item.companyName}
            size="xm"
          />
          <div className="min-w-0 flex-1">
            <p className="wrap-break-word text-[12px] font-normal leading-4 text-neutral-primary">
              {item.companyName}
            </p>
            {copy.location && (
              <p className="mt-0.5 wrap-break-word text-[11px] leading-4 text-neutral-muted">
                {copy.location}
              </p>
            )}
          </div>
          {apply}
        </footer>
      </article>
    );
  return (
    <article
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border border-neutral-1000-a05 bg-bg-floating p-4",
        pending && "opacity-60"
      )}
    >
      <ClickablePanel
        aria-label={`${item.title} · ${item.companyName}`}
        onActivate={() => onOpenDetail(item)}
        className="flex min-h-[140px] flex-1 cursor-pointer flex-col rounded-lg text-left"
      >
        <span className="mb-3 w-fit rounded-full border border-neutral-1000-a05 p-0.5 [&>img]:rounded-full [&>span]:rounded-full">
          <CompanyLogo
            logoUrl={item.companyLogoUrl}
            name={item.companyName}
            size="xm"
          />
        </span>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[12px] font-normal leading-5 text-neutral-primary">
            {item.companyName}
          </span>
          <span className="text-[11px] leading-5 text-neutral-muted">
            {copy.posted}
          </span>
        </div>
        <Typography as="h3" variant="body" className="mt-0.5 wrap-break-word">
          {item.title}
        </Typography>
        {copy.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1 pb-3">
            {copy.tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-bg-weak px-1.5 py-0.5 text-[11px] leading-4 text-neutral-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </ClickablePanel>
      <footer className="mt-3 flex items-center justify-between gap-2 border-t border-neutral-1000-a05 pt-3">
        <div className="min-w-0">
          {copy.location && (
            <p className="wrap-break-word text-[12px] font-normal leading-4 text-neutral-primary">
              {copy.location}
            </p>
          )}
          <p className="mt-0.5 text-[11px] leading-4 text-neutral-muted">
            {copy.deadline}
          </p>
        </div>
        {apply}
      </footer>
    </article>
  );
});

function SavedOpportunityTableRow({
  item,
  pending,
  onOpenDetail,
  onApply,
}: ItemProps) {
  const t = useCareerT();
  const copy = usePostingCopy(item);
  return (
    <TableRow className="border-neutral-1000-a05">
      <TableCell className="py-2.5 pl-1">
        <ClickablePanel
          onActivate={() => onOpenDetail(item)}
          className="flex cursor-pointer items-center gap-2 rounded-md"
          aria-label={`${item.title} · ${item.companyName}`}
        >
          <CompanyLogo
            logoUrl={item.companyLogoUrl}
            name={item.companyName}
            size="xm"
          />
          <div className="min-w-0">
            <p className="wrap-break-word text-[13px] font-normal text-neutral-primary">
              {item.title}
            </p>
            <p className="mt-0.5 text-[11px] text-neutral-muted">
              {[item.companyName, copy.location].filter(Boolean).join(" · ")}
            </p>
          </div>
        </ClickablePanel>
      </TableCell>
      <TableCell className="text-[11px] text-neutral-muted">
        {copy.deadline || "—"}
      </TableCell>
      <TableCell className="pr-1 text-right">
        <MuteButton
          variant="dark"
          size="sm"
          className="whitespace-nowrap"
          disabled={pending || copy.expired}
          onClick={() => onApply(item)}
        >
          {t("career.history.external_application.apply", "지원하기")}
        </MuteButton>
      </TableCell>
    </TableRow>
  );
}

export default function SavedOpportunityViews({
  items,
  pendingOpportunityIds,
  onOpenDetail,
  onApply,
}: {
  items: CareerHistoryOpportunity[];
  pendingOpportunityIds?: Set<string>;
  onOpenDetail: ItemProps["onOpenDetail"];
  onApply: ItemProps["onApply"];
}) {
  const view = useCareerWorkspaceUiStore((s) => s.savedOpportunityView);
  const t = useCareerT();
  if (view === "table")
    return (
      <Table className="min-w-[360px] table-fixed">
        <TableHeader>
          <TableRow className="border-neutral-1000-a10 hover:bg-transparent [&>th]:h-8 [&>th]:text-xs [&>th]:font-normal">
            <TableHead className="pl-1">
              {t("career.common.career_workspace_screen.0jpahnv", "포지션")}
            </TableHead>
            <TableHead className="w-[90px]">
              {t("career.history.views.deadline", "마감일")}
            </TableHead>
            <TableHead className="w-[88px]">
              <span className="sr-only">
                {t("career.history.external_application.apply", "지원하기")}
              </span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <SavedOpportunityTableRow
              key={item.id}
              item={item}
              pending={Boolean(pendingOpportunityIds?.has(item.id))}
              onOpenDetail={onOpenDetail}
              onApply={onApply}
            />
          ))}
        </TableBody>
      </Table>
    );
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] items-stretch gap-3 pb-3">
      {items.map((item) => (
        <SavedOpportunityCard
          key={item.id}
          item={item}
          view={view}
          pending={Boolean(pendingOpportunityIds?.has(item.id))}
          onOpenDetail={onOpenDetail}
          onApply={onApply}
        />
      ))}
    </div>
  );
}
