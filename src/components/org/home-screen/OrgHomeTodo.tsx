import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, type ReactNode } from "react";
import { formatKstRelativeDate } from "@/components/ops/dateUtils";
import {
  OrgTodoGo,
  OrgTodoQuiet,
  orgTodoHeadings,
  orgTodoItemDescription,
  orgTodoItemText,
  orgTodoItemTitle,
  orgTodoItemWhen,
  useOrgTodoActions,
  type OrgTodoActionParts,
} from "@/components/org/OrgTodoChip";
import {
  ORG_TODO_COLUMN_ICON,
  OrgTodoCompactRow,
  OrgTodoDate,
  OrgTodoFoldedRows,
  OrgTodoFollowupCard,
} from "@/components/org/role-screen/OrgTodoCards";
import {
  orgWorkspaceTodoKey,
  useOrgWorkspaceTodo,
} from "@/hooks/org/useOrgRoleTodo";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { buildOrgHref } from "@/lib/org/routes";
import { COMPANY_TERMS, ct } from "@/lib/org/terms";
import type { OrgTodoColumn, OrgTodoItem } from "@/lib/org/todo";

/**
 * 소식's 할 일, the candidate side's panels for every role or the one 소식 is
 * narrowed to: 결정할 것 (지금 팔로업) — what the team decides and what stops
 * Harper, the only large cards; Harper가 할 수 있는 일 and 알림 — Harper's
 * offers (the first one shown) and the updates, compact, under the role
 * screen's names; then Harper's work and plans as compact rows. Each role's
 * numbers are on 역할.
 */
const DECIDE: OrgTodoColumn[] = ["my_turn", "blocked"];
const WORTH: OrgTodoColumn[] = ["suggestion", "notice"];
const LATER: OrgTodoColumn[] = ["in_progress", "scheduled"];

/**
 * One line with its role's actions (the role screen's, per line): a large card
 * for what the team decides, a compact row for the rest.
 */
function OrgHomeTodoLine({
  item,
  look,
  meta,
  onChanged,
  workspaceId,
}: {
  item: OrgTodoItem;
  look: "card" | "row";
  meta: ReactNode;
  onChanged: () => void;
  workspaceId: string;
}) {
  const { c, locale } = useOrgLocale();
  const roleId = item.roleId ?? "";
  const roleChat = buildOrgHref({ orgId: workspaceId, page: "role", roleId, tab: "chat" });
  // Approving a plan sends it to the role's chat as the team's message, so it
  // happens there; Home never sends one.
  const { actionParts, answer, decide, detail } = useOrgTodoActions({
    onApprove: () => undefined,
    onChanged,
    roleId,
    workspaceId,
  });
  let parts: OrgTodoActionParts;
  let trailing: ReactNode = null;
  if (item.kind === "suggestion") {
    parts = {
      primary: (
        <OrgTodoGo
          act={{ href: roleChat, key: "go", label: c("역할에서 진행하기", "Go ahead in the role") }}
        />
      ),
      secondary: [
        <OrgTodoQuiet
          act={{
            disabled: decide.isPending,
            key: "dismiss",
            label: c("괜찮아요", "Not now"),
            onClick: () => answer(item, "dismiss"),
          }}
          key="dismiss"
        />,
      ],
    };
    trailing = (
      <OrgTodoQuiet
        act={{
          disabled: decide.isPending,
          key: "mute",
          label: c("이런 제안 그만", "Stop suggesting this"),
          onClick: () => answer(item, "mute"),
        }}
      />
    );
  } else if (item.kind === "memory_proposal") {
    // Harper asked in the role's conversation; it is answered there.
    parts = {
      primary: (
        <OrgTodoGo act={{ href: roleChat, key: "answer", label: c("채팅에서 답하기", "Answer in chat") }} />
      ),
      secondary: [],
    };
  } else {
    parts = actionParts(item);
  }
  const error = decide.isError ? (
    <span className="text-critical" role="alert">
      {c("제안에 답하지 못했어요. 다시 눌러 주세요.", "Couldn't answer the suggestion. Try again.")}
    </span>
  ) : null;
  // Who set up Harper's work and a failed cancel; a suggestion's control is above.
  const below = item.kind === "suggestion" ? error : (error ?? detail(item));
  if (look === "card") {
    return (
      <OrgTodoFollowupCard
        description={orgTodoItemDescription(item, c, locale)}
        detail={below}
        meta={meta}
        parts={parts}
        title={orgTodoItemTitle(item, c, locale)}
      />
    );
  }
  const when = orgTodoItemWhen(item, locale);
  return (
    <OrgTodoCompactRow
      icon={ORG_TODO_COLUMN_ICON[item.column]}
      meta={
        below ? (
          <>
            {meta}
            {meta ? " · " : null}
            {below}
          </>
        ) : (
          meta
        )
      }
      parts={parts}
      title={when ? orgTodoItemText(item, c, locale) : orgTodoItemTitle(item, c, locale)}
      trailing={trailing}
      when={when || undefined}
    />
  );
}

/** Every role's To-do, or one role's (`roleId`), as the candidate side's panels. */
export function OrgHomeTodo({ roleId = null }: { roleId?: string | null } = {}) {
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
  const items = (todo.data?.items ?? []).filter((item) => !roleId || item.roleId === roleId);
  const inColumns = (columns: OrgTodoColumn[]) =>
    columns.flatMap((column) => items.filter((item) => item.column === column));
  const decide = inColumns(DECIDE);
  const headings = orgTodoHeadings(c);
  const roleName = (item: OrgTodoItem) =>
    (item.roleId && roleNames.get(item.roleId)) || ct(c, COMPANY_TERMS.role);
  const sources: Record<NonNullable<OrgTodoItem["source"]>, string> = {
    email: c("메일", "Email"),
    harper: "Harper",
    slack: "Slack",
    web: c("웹", "Web"),
  };
  const line = (item: OrgTodoItem, look: "card" | "row", meta: ReactNode) => (
    <OrgHomeTodoLine
      item={item}
      key={`${item.roleId ?? ""}:${item.id}`}
      look={look}
      meta={meta}
      onChanged={refresh}
      workspaceId={workspaceId}
    />
  );
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
            {decide.map((item) => line(item, "card", roleName(item)))}
          </ul>
        ) : null}
      </section>
      {/* Harper's suggestions and the updates under the role screen's names; suggestions fold after the first. */}
      {WORTH.map((column) => {
        const group = items.filter((item) => item.column === column);
        if (!group.length) return null;
        const rows = group.map((item) =>
          line(
            item,
            "row",
            [
              roleName(item),
              item.at ? formatKstRelativeDate(item.at, { locale }) : null,
              item.source ? sources[item.source] : null,
            ]
              .filter(Boolean)
              .join(" · ")
          )
        );
        return (
          <section
            aria-label={headings[column]}
            className="career-content org-todo-compact"
            key={column}
          >
            <h2 className="career-content-heading">
              {headings[column]} {group.length}
            </h2>
            {column === "suggestion" ? (
              <OrgTodoFoldedRows>{rows}</OrgTodoFoldedRows>
            ) : (
              <ul className="org-todo-rows">{rows}</ul>
            )}
          </section>
        );
      })}
      {LATER.map((column) => {
        const group = items.filter((item) => item.column === column);
        return group.length ? (
          <section
            aria-label={headings[column]}
            className="career-content org-todo-compact"
            key={column}
          >
            <h2 className="career-content-heading">
              {headings[column]} {group.length}
            </h2>
            <ul className="org-todo-rows">
              {group.map((item) => line(item, "row", roleName(item)))}
            </ul>
          </section>
        ) : null;
      })}
    </div>
  );
}
