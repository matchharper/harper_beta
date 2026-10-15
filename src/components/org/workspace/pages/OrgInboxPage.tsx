import { canUsePendingConnections } from "@/lib/org/billing/types";
import { useOrgEntitlements } from "@/hooks/org/useOrgBilling";
import { OrgPendingConnectionGate } from "@/components/org/billing/OrgPendingConnectionGate";
import { LockKeyhole } from "lucide-react";
import { useOrgSourceT, useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { InternalOnlyHatch } from "@/components/org/internal/InternalOnlySurface";
import { TalentDetailSimpleView } from "@/components/org/TalentDetailSimpleView";
import { OrgErrorState } from "@/components/org/workspace/OrgErrorState";
import { OrgPageHeader } from "@/components/org/workspace/OrgPageHeader";
import {
  OrgTalentTable,
  OrgTalentTableLoading,
} from "@/components/org/workspace/OrgTalentTable";
import { MuteButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useOrgInbox } from "@/hooks/org/useOrg";
import { OrgJobsProvider, useOrgJobsNavigation } from "@/hooks/org/useOrgJobs";
import { useOrgViewedRecommendations } from "@/hooks/org/useOrgViewedRecommendations";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { cn } from "@/lib/utils";

type InboxFilter =
  | "acceptedWaiting"
  | "introAvailable"
  | "pendingConnection"
  | "unread";

const INBOX_FILTERS = [
  { label: "미열람", value: "unread" },
  { label: "연결 대기", value: "pendingConnection" },
  { label: "Intro 요청 가능", value: "introAvailable" },
] as const;

function OrgInboxMain() {
  const { c } = useOrgLocale();
  const sourceT = useOrgSourceT();
  const [activeFilters, setActiveFilters] = useState<InboxFilter[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const { changeRole, selectTalent } = useOrgJobsNavigation();
  const { currentUserEmail, internalOpsAccess, roles, workspace } =
    useOrgWorkspace();
  const workspaceId = workspace.workspaceId;
  const inboxQuery = useOrgInbox({ workspaceId });
  const entitlements = useOrgEntitlements(workspaceId);
  const pendingLocked =
    Boolean(entitlements.data) &&
    (entitlements.data?.pendingConnections === false ||
      (selectedRoleIds.length > 0 &&
        selectedRoleIds.every(
          (roleId) => !canUsePendingConnections(entitlements.data, roleId)
        )));
  const { hasHydrated, isViewed, markViewed } = useOrgViewedRecommendations({
    currentUserEmail,
    workspaceId,
  });
  const items = useMemo(
    () =>
      (inboxQuery.data?.items ?? []).filter(
        (item) =>
          item.stage !== "archived" &&
          (item.stage !== "pending_connection" ||
            canUsePendingConnections(entitlements.data, item.roleId))
      ),
    [inboxQuery.data?.items, entitlements.data]
  );
  const roleOptions = useMemo(() => {
    const roleNames = new Map(roles.map((role) => [role.roleId, role.name]));
    const inboxRoles = new Map<string, { count: number; name: string }>();

    items.forEach((item) => {
      const existingRole = inboxRoles.get(item.roleId);
      inboxRoles.set(item.roleId, {
        count: (existingRole?.count ?? 0) + 1,
        name:
          item.roleName ||
          roleNames.get(item.roleId) ||
          existingRole?.name ||
          c("이름 없는 역할", "Unnamed role"),
      });
    });

    return Array.from(inboxRoles, ([roleId, role]) => ({
      roleId,
      ...role,
    })).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [items, roles, c]);
  const selectedRoleLabel = useMemo(() => {
    if (selectedRoleIds.length === 0) return c("역할 전체", "All roles");
    if (selectedRoleIds.length > 1)
      return c("역할 {p0}개", "{p0} roles", {
        p0: selectedRoleIds.length,
      });
    return (
      roleOptions.find((role) => role.roleId === selectedRoleIds[0])?.name ??
      c("역할 1개", "1 role")
    );
  }, [roleOptions, selectedRoleIds, c]);
  const unreadOnly = activeFilters.includes("unread");
  const pendingConnectionOnly = activeFilters.includes("pendingConnection");
  const acceptedWaitingOnly = activeFilters.includes("acceptedWaiting");
  const introAvailableOnly = activeFilters.includes("introAvailable");
  const normalizedSearchQuery = searchQuery.toLocaleLowerCase("ko-KR");
  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        if (
          selectedRoleIds.length > 0 &&
          !selectedRoleIds.includes(item.roleId)
        ) {
          return false;
        }
        if (unreadOnly && isViewed(item.recommendationId)) return false;
        if (
          (acceptedWaitingOnly ||
            pendingConnectionOnly ||
            introAvailableOnly) &&
          !(
            (acceptedWaitingOnly && item.stage === "accepted") ||
            (pendingConnectionOnly && item.stage === "pending_connection") ||
            (introAvailableOnly && item.stage === "company_intro")
          )
        ) {
          return false;
        }
        if (normalizedSearchQuery) {
          const name = item.talent.name?.toLocaleLowerCase("ko-KR") ?? "";
          const email = item.talent.email?.toLocaleLowerCase("ko-KR") ?? "";
          if (
            !name.includes(normalizedSearchQuery) &&
            !email.includes(normalizedSearchQuery)
          ) {
            return false;
          }
        }
        return true;
      }),
    [
      acceptedWaitingOnly,
      introAvailableOnly,
      isViewed,
      items,
      normalizedSearchQuery,
      pendingConnectionOnly,
      selectedRoleIds,
      unreadOnly,
    ]
  );
  const hasActiveFilter =
    activeFilters.length > 0 ||
    selectedRoleIds.length > 0 ||
    searchQuery.length > 0;

  const toggleInboxFilter = (filter: InboxFilter) => {
    setActiveFilters((currentFilters) =>
      currentFilters.includes(filter)
        ? currentFilters.filter((currentFilter) => currentFilter !== filter)
        : [...currentFilters, filter]
    );
  };

  const toggleRole = (roleId: string, selected: boolean) => {
    setSelectedRoleIds((currentRoleIds) =>
      selected
        ? Array.from(new Set([...currentRoleIds, roleId]))
        : currentRoleIds.filter((currentRoleId) => currentRoleId !== roleId)
    );
  };

  return (
    <div className="space-y-6">
      <OrgPageHeader
        description={c(
          "최근 추천된 후보자를 확인해요.",
          "Review suggested candidates and those ready to connect."
        )}
        title={c("Inbox", "Inbox")}
      />

      {pendingLocked && activeFilters.includes("pendingConnection") && (
        <OrgPendingConnectionGate workspaceId={workspaceId} />
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          aria-label={c("Inbox 후보자 필터", "Inbox candidate filter")}
          className="flex flex-wrap items-center gap-2"
          role="group"
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <MuteButton
                aria-label={c("역할 필터: {p0}", "Role filter: {p0}", {
                  p0: selectedRoleLabel,
                })}
                className={cn(
                  "h-8 max-w-52 gap-1.5 text-[13px]",
                  selectedRoleIds.length > 0 &&
                    "border-primary/25 bg-primary-faded text-primary hover:border-primary/40 hover:bg-accent-200/55"
                )}
                disabled={roleOptions.length === 0}
                size="sm"
                variant={selectedRoleIds.length > 0 ? "neutral" : "default"}
              >
                <span className="truncate">{selectedRoleLabel}</span>
                <ChevronDown aria-hidden className="size-3.5" />
              </MuteButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              <DropdownMenuItem
                onSelect={() => setSelectedRoleIds([])}
                selected={selectedRoleIds.length === 0}
                variant="sm"
              >
                {c("전체 역할", "All roles")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {roleOptions.map((role) => (
                <DropdownMenuCheckboxItem
                  checked={selectedRoleIds.includes(role.roleId)}
                  className="gap-2 rounded-[8px] py-1.5 text-[13px]"
                  indicatorPosition="right"
                  key={role.roleId}
                  onCheckedChange={(checked) =>
                    toggleRole(role.roleId, checked === true)
                  }
                  onSelect={(event) => event.preventDefault()}
                >
                  <span className="min-w-0 flex-1 truncate">{role.name}</span>
                  <span className="text-[11px] tabular-nums text-neutral-soft">
                    {role.count}
                  </span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <MuteButton
            aria-pressed={unreadOnly}
            className={cn(
              "h-8 gap-1.5 text-[13px]",
              unreadOnly &&
                "border-primary/25 bg-primary-faded text-primary hover:border-primary/40 hover:bg-accent-200/55"
            )}
            disabled={!hasHydrated}
            onClick={() => toggleInboxFilter(INBOX_FILTERS[0].value)}
            size="sm"
            variant={unreadOnly ? "neutral" : "default"}
          >
            {unreadOnly ? <Check aria-hidden className="size-3.5" /> : null}
            {sourceT(INBOX_FILTERS[0].label)}
          </MuteButton>

          {internalOpsAccess ? (
            <MuteButton
              aria-pressed={acceptedWaitingOnly}
              className={cn(
                "relative isolate h-8 gap-1.5 overflow-hidden text-[13px]",
                acceptedWaitingOnly &&
                  "border-primary/25 bg-primary-faded text-primary hover:border-primary/40 hover:bg-accent-200/55"
              )}
              onClick={() => toggleInboxFilter("acceptedWaiting")}
              size="sm"
              variant={acceptedWaitingOnly ? "neutral" : "default"}
            >
              <InternalOnlyHatch className="opacity-70" />
              {acceptedWaitingOnly ? (
                <Check aria-hidden className="relative z-20 size-3.5" />
              ) : null}
              <span className="relative z-20">
                {c("수락 후 대기", "Awaiting Harper review")}
              </span>
            </MuteButton>
          ) : null}

          <MuteButton
            aria-pressed={pendingConnectionOnly}
            className={cn(
              "h-8 gap-1.5 text-[13px]",
              pendingConnectionOnly &&
                "border-primary/25 bg-primary-faded text-primary hover:border-primary/40 hover:bg-accent-200/55"
            )}
            onClick={() => toggleInboxFilter(INBOX_FILTERS[1].value)}
            size="sm"
            variant={pendingConnectionOnly ? "neutral" : "default"}
          >
            {pendingConnectionOnly ? (
              <Check aria-hidden className="size-3.5" />
            ) : null}
            {sourceT(INBOX_FILTERS[1].label)}
            {pendingLocked && (
              <LockKeyhole className="size-3" aria-label="Agent" />
            )}
          </MuteButton>

          <MuteButton
            aria-pressed={introAvailableOnly}
            className={cn(
              "h-8 gap-1.5 text-[13px]",
              introAvailableOnly &&
                "border-primary/25 bg-primary-faded text-primary hover:border-primary/40 hover:bg-accent-200/55"
            )}
            onClick={() => toggleInboxFilter(INBOX_FILTERS[2].value)}
            size="sm"
            variant={introAvailableOnly ? "neutral" : "default"}
          >
            {introAvailableOnly ? (
              <Check aria-hidden className="size-3.5" />
            ) : null}
            {sourceT(INBOX_FILTERS[2].label)}
          </MuteButton>

          {searchOpen ? (
            <form
              aria-label={c("이름 또는 이메일 검색", "Search by name or email")}
              className="relative"
              onSubmit={(event) => {
                event.preventDefault();
                setSearchQuery(searchDraft.trim());
              }}
              role="search"
            >
              <Search
                aria-hidden
                className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-3.5 -translate-y-1/2 text-neutral-soft"
              />
              <Input
                aria-label={c("이름 또는 이메일 검색어", "Name or email")}
                autoFocus
                className="h-8 w-60 py-0 pl-8 pr-8 text-[13px]"
                onChange={(event) => setSearchDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  setSearchDraft(searchQuery);
                  setSearchOpen(false);
                }}
                placeholder={c(
                  "이름 또는 이메일 검색",
                  "Search by name or email"
                )}
                value={searchDraft}
              />
              <MuteButton
                aria-label={
                  searchDraft || searchQuery
                    ? c("검색어 지우기", "Clear search")
                    : c("검색 닫기", "Close search")
                }
                className="absolute right-1 top-1/2 size-6 -translate-y-1/2 p-0"
                onClick={() => {
                  if (searchDraft || searchQuery) {
                    setSearchDraft("");
                    setSearchQuery("");
                    return;
                  }
                  setSearchOpen(false);
                }}
                size="sm"
                type="button"
                variant="transparent"
              >
                <X aria-hidden className="size-3.5" />
              </MuteButton>
            </form>
          ) : (
            <MuteButton
              aria-label={c("이름 또는 이메일 검색", "Search by name or email")}
              className={cn(
                "h-8 px-2",
                searchQuery &&
                  "border-primary/25 bg-primary-faded text-primary hover:border-primary/40 hover:bg-accent-200/55"
              )}
              onClick={() => setSearchOpen(true)}
              size="sm"
              variant={searchQuery ? "neutral" : "transparent"}
            >
              <Search aria-hidden className="size-3.5" />
            </MuteButton>
          )}
        </div>
        <div
          aria-live="polite"
          className="text-[12px] font-light tabular-nums text-neutral-muted"
        >
          {c(
            "{visible}명 표시 · 전체 {total}명",
            "Showing {visible} of {total} candidates",
            {
              visible: visibleItems.length,
              total: items.length,
            }
          )}
        </div>
      </div>

      {inboxQuery.error instanceof Error ? (
        <OrgErrorState
          message={inboxQuery.error.message}
          onRetry={() => void inboxQuery.refetch()}
        />
      ) : inboxQuery.isLoading ? (
        <OrgTalentTableLoading showCompany={false} />
      ) : visibleItems.length > 0 ? (
        <OrgTalentTable
          companyHeader={null}
          dateHeader={c("추천일", "Date added")}
          onSelect={(item) => {
            markViewed(item.recommendationId);
            selectTalent(item, visibleItems, "Inbox");
          }}
          onSelectRole={(item) => changeRole(item.roleId)}
          rows={visibleItems.map((item) => ({
            date: item.recommendedAt,
            item,
            key: item.recommendationId,
            name:
              item.talent.name ||
              item.talent.email ||
              item.talent.headline ||
              c("이름 없음", "No name"),
            profilePicture: item.talent.profilePicture,
            roleName: item.roleName,
            statusLabel:
              item.stage === "company_intro"
                ? c("검토 대기", "Suggested candidate")
                : item.stage === "intro_requested"
                  ? c("Intro Requested", "Intro requested")
                  : item.stage === "accepted"
                    ? c("수락 후 대기", "Awaiting Harper review")
                    : item.stage === "pending_connection"
                      ? c("연결 대기", "Ready to connect")
                      : c("결정 완료", "Decision made"),
            statusTone:
              item.stage === "company_intro" ||
              item.stage === "accepted" ||
              item.stage === "pending_connection"
                ? "primary"
                : item.stage === "intro_requested"
                  ? "action"
                  : "muted",
            viewed: isViewed(item.recommendationId),
          }))}
          statusHeader={c("연결 상태", "Status")}
        />
      ) : (
        <div className="rounded-lg border border-neutral-1000-a05 bg-bg-floating px-5 py-14 text-center">
          <div className="text-[14px] font-medium text-neutral-primary">
            {hasActiveFilter
              ? c(
                  "조건에 맞는 후보자가 없어요.",
                  "No candidates match the criteria."
                )
              : c(
                  "아직 Inbox에 표시할 후보자가 없어요.",
                  "No candidates in the Inbox yet."
                )}
          </div>
          <div className="mt-1 text-[13px] font-light text-neutral-muted">
            {hasActiveFilter
              ? c(
                  "필터를 해제하면 추천 후보자 전체를 다시 확인할 수 있어요.",
                  "Clear filters to view all recommended candidates."
                )
              : c(
                  "먼저 제안할 수 있는 후보자와 수락 이후 연결 검토가 시작된 후보자가 여기에 표시돼요.",
                  "Candidates will appear here when they're ready for your review."
                )}
          </div>
        </div>
      )}
    </div>
  );
}

export function OrgInboxPage() {
  return (
    <OrgJobsProvider includeBoard={false} routePage="inbox">
      <OrgInboxMain />
      <TalentDetailSimpleView />
    </OrgJobsProvider>
  );
}
