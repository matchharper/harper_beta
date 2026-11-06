import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, type ReactNode } from "react";
import { formatKstRelativeDate } from "@/components/ops/dateUtils";
import { OrgHomeRoleCards } from "@/components/org/OrgHomeInbox";
import { OrgRoleStatusDot } from "@/components/org/OrgRoleStatusDot";
import {
  orgTodoHeadings,
  orgTodoItemText,
  useOrgTodoActions,
} from "@/components/org/OrgTodoChip";
import { OrgTodoCard, OrgTodoDate } from "@/components/org/role-screen/OrgTodoCards";
import { MuteButton } from "@/components/ui/button";
import { useOrgJobsBoard } from "@/hooks/org/useOrgJobs";
import {
  orgWorkspaceTodoKey,
  useOrgWorkspaceTodo,
} from "@/hooks/org/useOrgRoleTodo";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useOrgLocale, useOrgSourceT } from "@/i18n/org/OrgLocaleProvider";
import { sortOrgRolesForRecentList } from "@/lib/org/recentRoles";
import { isOrgRoleOpenPipelineStage } from "@/lib/org/roleScreen";
import {
  getOrgRoleStatusFilterValue,
  getOrgRoleStatusPresentation,
} from "@/lib/org/roleStatus";
import { buildOrgHref } from "@/lib/org/routes";
import { COMPANY_TERMS, ct } from "@/lib/org/terms";
import type { OrgNowRole, OrgTodoColumn, OrgTodoItem } from "@/lib/org/todo";

/**
 * Home's 채팅 side, the candidate side's panels for every role:
 * 결정할 것 (지금 팔로업) — what the team decides and what stops Harper;
 * 볼 만한 것 — Harper's offers and the updates; then Harper's work and plans;
 * 역할 현황 (지원 현황) — each role's numbers.
 */
const DECIDE: OrgTodoColumn[] = ["my_turn", "blocked"];
const WORTH: OrgTodoColumn[] = ["suggestion", "notice"];
const LATER: OrgTodoColumn[] = ["in_progress", "scheduled"];
export const ORG_HOME_TODO_COLUMNS: OrgTodoColumn[] = [...DECIDE, ...WORTH, ...LATER];

/** A line as a card with its role's actions (the role screen's, per line). */
function OrgHomeTodoCard({
  emphasis,
  item,
  meta,
  onChanged,
  variant,
  workspaceId,
}: {
  emphasis: boolean;
  item: OrgTodoItem;
  meta: ReactNode;
  onChanged: () => void;
  variant: "followup" | "content";
  workspaceId: string;
}) {
  const { c, locale } = useOrgLocale();
  const roleId = item.roleId ?? "";
  const roleChat = buildOrgHref({ orgId: workspaceId, page: "role", roleId, tab: "chat" });
  // Approving a plan sends it to the role's chat as the team's message, so it
  // happens there; Home never sends one.
  const { action, answer, decide } = useOrgTodoActions({
    onApprove: () => undefined,
    onChanged,
    roleId,
    workspaceId,
  });
  let buttons: ReactNode;
  let footer: ReactNode = null;
  if (item.kind === "suggestion") {
    buttons = (
      <>
        <MuteButton
          disabled={decide.isPending}
          onClick={() => answer(item, "dismiss")}
          size="sm"
          type="button"
          variant="dark"
        >
          {c("괜찮아요", "Not now")}
        </MuteButton>
        <MuteButton asChild size="sm" variant="dark">
          <Link href={roleChat}>{c("역할에서 진행하기", "Go ahead in the role")}</Link>
        </MuteButton>
      </>
    );
    footer = (
      <button
        className="career-card-close"
        disabled={decide.isPending}
        onClick={() => answer(item, "mute")}
        type="button"
      >
        {c("이런 제안 그만", "Stop suggesting this")}
      </button>
    );
  } else if (item.kind === "memory_proposal") {
    // Harper asked in the role's conversation; it is answered there.
    buttons = (
      <MuteButton asChild size="sm" variant="dark">
        <Link href={roleChat}>{c("채팅에서 답하기", "Answer in chat")}</Link>
      </MuteButton>
    );
  } else {
    buttons = action(item);
  }
  return (
    <OrgTodoCard
      action={buttons}
      emphasis={emphasis}
      footer={
        decide.isError ? (
          <span className="text-[12px] text-critical" role="alert">
            {c("제안에 답하지 못했어요. 다시 눌러 주세요.", "Couldn't answer the suggestion. Try again.")}
          </span>
        ) : (
          footer
        )
      }
      meta={meta}
      title={orgTodoItemText(item, c, locale)}
      variant={variant}
    />
  );
}

type OverviewRow = {
  role: ReturnType<typeof useOrgWorkspace>["roles"][number];
  stats: Array<{ href: string | null; key: string; label: string; value: number }>;
};

/** Each open role's numbers: the inbox's counts and the role screen's 파이프라인 rule. */
function useOrgHomeRoleOverview(nowRoles: OrgNowRole[]) {
  const { c } = useOrgLocale();
  const { internalOpsAccess, roles, workspace } = useOrgWorkspace();
  const { board } = useOrgJobsBoard();
  const workspaceId = workspace.workspaceId;
  const pipeline = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of board?.items ?? []) {
      if (item.savedAt || !isOrgRoleOpenPipelineStage(item.stage, internalOpsAccess)) continue;
      counts.set(item.roleId, (counts.get(item.roleId) ?? 0) + 1);
    }
    return counts;
  }, [board?.items, internalOpsAccess]);
  const counts = new Map(nowRoles.map((role) => [role.roleId, role.counts]));
  const rows: OverviewRow[] = sortOrgRolesForRecentList(roles)
    .map((role) => {
      const now = counts.get(role.roleId);
      const href = (patch: { tab: "inbox" | "pipeline"; inboxStage?: "pending_connection" | "company_intro" }) =>
        buildOrgHref({ orgId: workspaceId, page: "role", roleId: role.roleId, ...patch });
      return {
        role,
        stats: [
          {
            key: "pending_connection",
            label: ct(c, COMPANY_TERMS.stage.pending_connection),
            value: now?.pending_connection ?? 0,
            href: href({ tab: "inbox", inboxStage: "pending_connection" }),
          },
          {
            key: "company_intro",
            label: ct(c, COMPANY_TERMS.stage.company_intro),
            value: now?.company_intro ?? 0,
            href: href({ tab: "inbox", inboxStage: "company_intro" }),
          },
          // A number only; there is no list of the people Harper is checking.
          {
            key: "reviewing",
            label: ct(c, COMPANY_TERMS.stage.accepted),
            value: now?.reviewing ?? 0,
            href: null,
          },
          {
            key: "pipeline",
            label: ct(c, COMPANY_TERMS.tab.pipeline),
            value: pipeline.get(role.roleId) ?? 0,
            href: href({ tab: "pipeline" }),
          },
        ],
      };
    })
    .filter(
      ({ role, stats }) =>
        ["active", "paused"].includes(getOrgRoleStatusFilterValue(role.status)) ||
        stats.some((stat) => stat.value > 0)
    );
  return { rows, hasNumbers: rows.some(({ stats }) => stats.some((stat) => stat.value > 0)) };
}

/** 역할 현황, like the candidate side's 지원 현황: a card per role, each number opening its list. */
function OrgHomeRoleOverview({ rows }: { rows: OverviewRow[] }) {
  const { c } = useOrgLocale();
  const sourceT = useOrgSourceT();
  const { workspace } = useOrgWorkspace();
  const title = ct(c, COMPANY_TERMS.home.roleOverview);
  return (
    <section aria-label={title} className="career-content" data-org-role-overview>
      <h2 className="career-content-heading">
        {title} {rows.length}
      </h2>
      <ul className="space-y-3">
        {rows.map(({ role, stats }) => (
          <li key={role.roleId}>
            <article className="career-summary career-glass org-home-role-overview">
              <Link
                className="org-home-role-overview-head"
                href={buildOrgHref({ orgId: workspace.workspaceId, page: "role", roleId: role.roleId })}
              >
                <OrgRoleStatusDot decorative status={role.status} />
                <span className="org-home-role-name">{role.name}</span>
                <span className="org-home-role-status">
                  {sourceT(getOrgRoleStatusPresentation(role.status).label)}
                </span>
                <ChevronRight aria-hidden className="size-4 shrink-0" />
              </Link>
              <div className="org-home-role-stats">
                {stats.map((stat) => {
                  const body = (
                    <>
                      <span className="org-home-role-stat-value">{stat.value}</span>
                      <span className="org-home-role-stat-label">{stat.label}</span>
                    </>
                  );
                  return stat.href ? (
                    <Link className="org-home-role-stat" href={stat.href} key={stat.key}>
                      {body}
                    </Link>
                  ) : (
                    <span className="org-home-role-stat" key={stat.key}>
                      {body}
                    </span>
                  );
                })}
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Every role's To-do and numbers as the candidate side's panels. */
export function OrgHomeTodo() {
  const { c, locale } = useOrgLocale();
  const { roles, workspace } = useOrgWorkspace();
  const workspaceId = workspace.workspaceId;
  const client = useQueryClient();
  const todo = useOrgWorkspaceTodo({ workspaceId });
  const roleNames = useMemo(
    () => new Map(roles.map((role) => [role.roleId, role.name])),
    [roles]
  );
  const refresh = useCallback(() => {
    void client.invalidateQueries({ queryKey: orgWorkspaceTodoKey(workspaceId) });
  }, [client, workspaceId]);
  const overview = useOrgHomeRoleOverview(todo.data?.roles ?? []);

  if (todo.isLoading) {
    return (
      <p className="px-1 py-4 text-[13px] text-neutral-muted">{c("불러오는 중", "Loading")}</p>
    );
  }
  if (todo.isError) {
    return (
      <p className="px-1 py-4 text-[13px] text-neutral-muted">
        {c("할 일을 불러오지 못했어요.", "Couldn't load the to-do.")}{" "}
        <button className="underline" onClick={() => void todo.refetch()} type="button">
          {c("다시 시도", "Retry")}
        </button>
      </p>
    );
  }
  const items = todo.data?.items ?? [];
  const inColumns = (columns: OrgTodoColumn[]) =>
    columns.flatMap((column) => items.filter((item) => item.column === column));
  const decide = inColumns(DECIDE);
  const worth = inColumns(WORTH);
  const headings = orgTodoHeadings(c);
  const roleName = (item: OrgTodoItem) =>
    (item.roleId && roleNames.get(item.roleId)) || ct(c, COMPANY_TERMS.role);
  const sources: Record<NonNullable<OrgTodoItem["source"]>, string> = {
    email: c("메일", "Email"),
    harper: "Harper",
    slack: "Slack",
    web: c("웹", "Web"),
  };
  const card = (item: OrgTodoItem, emphasis: boolean, variant: "followup" | "content", meta: ReactNode) => (
    <OrgHomeTodoCard
      emphasis={emphasis}
      item={item}
      key={`${item.roleId ?? ""}:${item.id}`}
      meta={meta}
      onChanged={refresh}
      variant={variant}
      workspaceId={workspaceId}
    />
  );
  const nothing = !items.some((item) => ORG_HOME_TODO_COLUMNS.includes(item.column));
  return (
    <div className="career-followups org-todo-cards org-home-panels" data-org-home-panels>
      <section aria-label={headings.my_turn}>
        <header className="career-followups-header">
          <OrgTodoDate />
          <h1>
            {headings.my_turn} {decide.length}
          </h1>
        </header>
        {decide.length ? (
          <ul className="space-y-3">
            {decide.map((item) => card(item, true, "followup", roleName(item)))}
          </ul>
        ) : null}
      </section>
      {worth.length ? (
        <section aria-label={ct(c, COMPANY_TERMS.home.worthALook)} className="career-content">
          <h2 className="career-content-heading">
            {ct(c, COMPANY_TERMS.home.worthALook)} {worth.length}
          </h2>
          <ul className="space-y-3">
            {worth.map((item) =>
              card(
                item,
                false,
                "content",
                [
                  roleName(item),
                  item.at ? formatKstRelativeDate(item.at, { locale }) : null,
                  item.source ? sources[item.source] : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              )
            )}
          </ul>
        </section>
      ) : null}
      {LATER.map((column) => {
        const group = items.filter((item) => item.column === column);
        return group.length ? (
          <section aria-label={headings[column]} className="career-content" key={column}>
            <h2 className="career-content-heading">
              {headings[column]} {group.length}
            </h2>
            <ul className="space-y-3">
              {group.map((item) => card(item, false, "followup", roleName(item)))}
            </ul>
          </section>
        ) : null;
      })}
      {overview.hasNumbers ? (
        <OrgHomeRoleOverview rows={overview.rows} />
      ) : nothing && roles.length ? (
        // Nothing to do and nothing to count: the roles, one click away.
        <section aria-label={ct(c, COMPANY_TERMS.nav.roles)} className="career-content">
          <h2 className="career-content-heading">{ct(c, COMPANY_TERMS.nav.roles)}</h2>
          <OrgHomeRoleCards roles={roles} workspaceId={workspaceId} />
        </section>
      ) : null}
    </div>
  );
}
