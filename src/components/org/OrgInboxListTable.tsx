import {
  BriefcaseBusiness,
  GraduationCap,
  LoaderCircle,
  X,
} from "lucide-react";
import {
  type DragEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { useMutationState } from "@tanstack/react-query";
import { formatKstRelativeDate } from "@/components/ops/dateUtils";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveLightTooltip } from "@/components/ui/tooltip";
import {
  useOrgAgentChat,
  useOrgAgentMessageHistory,
} from "@/hooks/org/useOrgAgent";
import { useOrgRoleListColumns } from "@/hooks/org/useOrgRoleViews";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { migrateOrgAgentModel } from "@/lib/org/agent/modelConfig";
import { useOrgLocale, useOrgSourceT } from "@/i18n/org/OrgLocaleProvider";
import { getOrgCandidateCardDate } from "@/lib/org/candidateCardDate";
import { getOrgCandidateDisplayName } from "./OrgCandidateCard";
import { OrgCriterionFitIcon } from "./OrgCriteriaEvaluation";
import { OrgListColumnMenu } from "./OrgListColumnMenu";
import {
  companyCriterionFitnessLabel,
  companyCriterionScoreLabel,
  type OrgCompanyCriteriaEvaluation,
} from "@/lib/org/companyCriteriaEvaluations";
import type { OrgBoardItem, OrgBoardProfileLabel } from "@/lib/org/server";
import { cn } from "@/lib/utils";

/** Criteria in the order the team's evaluations list them. */
function criteriaNames(items: OrgBoardItem[]) {
  const names: string[] = [];
  for (const item of items) {
    for (const evaluation of item.criteriaEvaluations) {
      if (!names.includes(evaluation.name)) names.push(evaluation.name);
    }
  }
  return names;
}

function FitCell({
  evaluation,
}: {
  evaluation: OrgCompanyCriteriaEvaluation | undefined;
}) {
  const { c, locale } = useOrgLocale();
  if (!evaluation) {
    return <span className="text-neutral-soft">—</span>;
  }
  const fit = companyCriterionFitnessLabel(evaluation.fitness, locale);
  const score = companyCriterionScoreLabel(evaluation.score);
  const label = [evaluation.name, fit, score].filter(Boolean).join(" · ");
  return (
    <ResponsiveLightTooltip
      className="w-auto"
      contentClassName="max-w-72 p-3"
      mobileAriaLabel={label}
      trigger={
        <span
          aria-label={label}
          className="inline-flex size-6 items-center justify-center"
        >
          {evaluation.pending ? (
            <LoaderCircle
              aria-hidden
              className="size-4 animate-spin text-neutral-soft"
            />
          ) : (
            <OrgCriterionFitIcon fitness={evaluation.fitness} />
          )}
        </span>
      }
      triggerClassName="w-auto rounded-sm focus-visible:ring-2 focus-visible:ring-neutral-400"
    >
      <div className="font-medium">{evaluation.name}</div>
      <div className="mt-1 text-neutral-muted">
        {evaluation.pending
          ? c("기준이 바뀌어 다시 보는 중이에요", "Being re-checked")
          : [fit, score].filter(Boolean).join(" · ")}
      </div>
      {evaluation.content ? <p className="mt-2">{evaluation.content}</p> : null}
    </ResponsiveLightTooltip>
  );
}

function ProfileLabelCell({
  icon: Icon,
  label,
}: {
  icon: typeof BriefcaseBusiness;
  label: OrgBoardProfileLabel | undefined;
}) {
  if (!label) return <span className="text-neutral-soft">—</span>;
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2 text-[13px] text-neutral-primary">
        <span className="relative flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-full text-neutral-muted">
          <Icon aria-hidden className="size-3.5" />
          {label.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              className="absolute inset-0 size-full bg-bg-floating object-cover"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
              src={label.logoUrl}
            />
          ) : null}
        </span>
        <span className="truncate">{label.label}</span>
      </div>
      {label.detail ? (
        <div className="mt-0.5 truncate text-[12px] text-neutral-muted">
          {label.detail}
        </div>
      ) : null}
    </div>
  );
}

/** Column ids this viewer saved for a Role (order or hidden), in their browser. */
function readColumnOrder(key: string | null): string[] {
  if (!key || typeof window === "undefined") return [];
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

type MovableColumn = {
  cell: (item: OrgBoardItem) => ReactNode;
  cellClassName: string;
  header: ReactNode;
  headerClassName: string;
  id: string;
  /** Cells with their own controls don't open the profile. */
  keepClicks?: boolean;
  /** The name in the column menu. */
  label: string;
  /** A column Harper added, which the team can delete. */
  removable?: boolean;
};

/**
 * The inbox list: one row per candidate, a column per criterion, the latest
 * job and school, and the comparison columns the team asked Harper to add.
 * Columns between the candidate and the date can be dragged into any order.
 */
export function OrgInboxListTable({
  canManageCandidates,
  items,
  onOpen,
  onToggleSelected,
  roleId,
  selectedIds,
  workspaceId,
}: {
  canManageCandidates: boolean;
  items: OrgBoardItem[];
  onOpen: (item: OrgBoardItem) => void;
  /** Omitted where the list has no bulk actions (Saved). */
  onToggleSelected?: (item: OrgBoardItem, selected: boolean) => void;
  roleId: string | null;
  selectedIds: ReadonlySet<string>;
  workspaceId: string;
}) {
  const { c, locale } = useOrgLocale();
  const sourceT = useOrgSourceT();
  const { columns, fill, fillKey, remove } = useOrgRoleListColumns({
    roleId,
    workspaceId,
  });
  // Cells for candidates who arrived after a column was made are written
  // once per column and candidate; meanwhile those cells show a skeleton.
  const requested = useRef(new Set<string>());
  const fillMutate = fill.mutate;
  useEffect(() => {
    for (const column of columns) {
      const missing = items
        .map((item) => item.talent.userId)
        .filter(
          (talentId) =>
            talentId &&
            !(talentId in column.values) &&
            !requested.current.has(`${column.id}:${talentId}`)
        );
      if (!missing.length) continue;
      for (const talentId of missing) {
        requested.current.add(`${column.id}:${talentId}`);
      }
      fillMutate({ columnId: column.id, talentIds: missing });
    }
  }, [columns, fillMutate, items]);
  const filling = new Set(
    useMutationState({
      filters: { mutationKey: fillKey, status: "pending" },
      select: (mutation) =>
        mutation.state.variables as
          | { columnId: string; talentIds: string[] }
          | undefined,
    }).flatMap((input) =>
      input
        ? input.talentIds.map((talentId) => `${input.columnId}:${talentId}`)
        : []
    )
  );
  const { user } = useOrgWorkspace();
  // Columns are added by Harper in this Role's chat, which reads the
  // candidates' profiles and fills the cells.
  const history = useOrgAgentMessageHistory({
    enabled: Boolean(roleId && canManageCandidates),
    mode: "role",
    roleId,
    workspaceId,
  });
  const chat = useOrgAgentChat({
    appendMessagesToCache: history.appendMessagesToCache,
    currentUserId: user.id,
    mode: "role",
    roleId,
    workspaceId,
  });
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const requestColumn = (request: { label: string; message: string }) => {
    let model: string | null = null;
    try {
      model = migrateOrgAgentModel(
        window.localStorage.getItem("harper:org-agent:model")
      );
    } catch {
      model = null;
    }
    setPendingLabel(request.label);
    void chat.sendMessage({
      message: request.message,
      model,
      onComplete: () => setPendingLabel(null),
    });
  };
  const pending = pendingLabel && chat.isStreaming ? pendingLabel : null;
  const criteria = criteriaNames(items);
  const selectable = Boolean(onToggleSelected);
  const stickyCell = "sticky z-10 bg-bg-default";

  const movable: MovableColumn[] = [
    ...criteria.map((name) => ({
      cell: (item: OrgBoardItem) => (
        <FitCell
          evaluation={item.criteriaEvaluations.find(
            (evaluation) => evaluation.name === name
          )}
        />
      ),
      cellClassName: "px-2 py-4",
      header: name,
      headerClassName: "min-w-24 max-w-36 px-2 leading-4 break-keep",
      id: `criterion:${name}`,
      keepClicks: true,
      label: name,
    })),
    {
      cell: (item: OrgBoardItem) => (
        <ProfileLabelCell
          icon={BriefcaseBusiness}
          label={item.talent.recentCompanies[0]}
        />
      ),
      cellClassName: "max-w-64 px-3 py-4",
      header: c("회사", "Company"),
      headerClassName: "min-w-52 px-3",
      id: "company",
      label: c("회사", "Company"),
    },
    {
      cell: (item: OrgBoardItem) => (
        <ProfileLabelCell
          icon={GraduationCap}
          label={item.talent.recentSchools[0]}
        />
      ),
      cellClassName: "max-w-64 px-3 py-4",
      header: c("학교", "School"),
      headerClassName: "min-w-52 px-3",
      id: "school",
      label: c("학교", "School"),
    },
    ...columns.map((column) => ({
      cell: (item: OrgBoardItem) => {
        const value = column.values[item.talent.userId];
        if (!value && filling.has(`${column.id}:${item.talent.userId}`)) {
          return <Skeleton className="h-3 w-24" />;
        }
        return value ? (
          <span
            className="line-clamp-2 whitespace-pre-wrap text-neutral-primary"
            title={value}
          >
            {value}
          </span>
        ) : (
          <span className="text-neutral-soft">—</span>
        );
      },
      cellClassName: "max-w-64 px-3 py-4 text-[13px]",
      header: (
        <span className="group/col flex items-center gap-1">
          <ResponsiveLightTooltip
            className="w-auto min-w-0"
            contentClassName="max-w-72 p-3"
            mobileAriaLabel={column.label}
            trigger={
              <span className="block leading-4 break-keep">{column.label}</span>
            }
            triggerClassName="w-auto min-w-0"
          >
            <div className="font-medium">{column.label}</div>
            {column.description ? (
              <p className="mt-1">{column.description}</p>
            ) : null}
          </ResponsiveLightTooltip>
          {canManageCandidates ? (
            <button
              aria-label={c("‘{p0}’ 열 지우기", "Remove the ‘{p0}’ column", {
                p0: column.label,
              })}
              className="shrink-0 rounded-sm p-0.5 text-neutral-soft opacity-0 transition hover:text-neutral-primary focus-visible:opacity-100 group-hover/col:opacity-100"
              disabled={remove.isPending}
              onClick={() => remove.mutate(column.id)}
              type="button"
            >
              <X aria-hidden className="size-3" />
            </button>
          ) : null}
        </span>
      ),
      headerClassName: "min-w-44 max-w-64 px-3",
      id: `custom:${column.id}`,
      label: column.label,
      removable: true,
    })),
  ];

  // Drag a header to move its column; the order stays for this Role.
  const orderKey = roleId ? `harper:org:inbox-list-order:${roleId}` : null;
  const [savedOrder, setSavedOrder] = useState(() => ({
    key: orderKey,
    order: readColumnOrder(orderKey),
  }));
  const order =
    savedOrder.key === orderKey ? savedOrder.order : readColumnOrder(orderKey);
  const ranked = new Map(order.map((id, index) => [id, index]));
  const orderedColumns = movable
    .map((column, index) => ({ column, index }))
    .sort(
      (left, right) =>
        (ranked.get(left.column.id) ?? order.length + left.index) -
        (ranked.get(right.column.id) ?? order.length + right.index)
    )
    .map(({ column }) => column);
  // Columns this viewer hid from the menu; kept per Role in their browser.
  const hiddenKey = roleId ? `harper:org:inbox-list-hidden:${roleId}` : null;
  const [savedHidden, setSavedHidden] = useState(() => ({
    key: hiddenKey,
    ids: readColumnOrder(hiddenKey),
  }));
  const hidden = new Set(
    savedHidden.key === hiddenKey ? savedHidden.ids : readColumnOrder(hiddenKey)
  );
  const setHidden = (next: Set<string>) => {
    const ids = [...next];
    setSavedHidden({ key: hiddenKey, ids });
    if (hiddenKey) {
      try {
        window.localStorage.setItem(hiddenKey, JSON.stringify(ids));
      } catch {
        // Applies until the page reloads.
      }
    }
  };
  const visibleColumns = orderedColumns.filter(
    (column) => !hidden.has(column.id)
  );
  // A wide list scrolls sideways with one scrollbar under the table, kept
  // visible (not only while scrolling); a fade on the right says there is more.
  // The scroll box is positioned so hidden labels inside the table stay in it;
  // otherwise they spill out and the whole inbox scrolls sideways too.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ right: false });
  const visibleCount = visibleColumns.length;
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const measure = () => {
      const right =
        element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
      setOverflow((current) => (current.right === right ? current : { right }));
    };
    measure();
    element.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => {
      element.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [visibleCount, pending]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{
    id: string;
    side: "after" | "before";
  } | null>(null);
  const endDrag = () => {
    setDragId(null);
    setDropAt(null);
  };
  const dropColumn = () => {
    if (!dragId || !dropAt || dragId === dropAt.id) return endDrag();
    const ids = orderedColumns.map((column) => column.id);
    const next = ids.filter((id) => id !== dragId);
    const at = next.indexOf(dropAt.id);
    if (at < 0) return endDrag();
    next.splice(dropAt.side === "before" ? at : at + 1, 0, dragId);
    setSavedOrder({ key: orderKey, order: next });
    if (orderKey) {
      try {
        window.localStorage.setItem(orderKey, JSON.stringify(next));
      } catch {
        // The new order still applies until the page reloads.
      }
    }
    endDrag();
  };
  const headerDragProps = (id: string) => ({
    draggable: true,
    onDragEnd: endDrag,
    onDragOver: (event: DragEvent<HTMLTableCellElement>) => {
      if (!dragId || dragId === id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const bounds = event.currentTarget.getBoundingClientRect();
      const side =
        event.clientX < bounds.left + bounds.width / 2 ? "before" : "after";
      setDropAt((current) =>
        current?.id === id && current.side === side ? current : { id, side }
      );
    },
    onDragStart: (event: DragEvent<HTMLTableCellElement>) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", id);
      setDragId(id);
    },
    onDrop: (event: DragEvent<HTMLTableCellElement>) => {
      event.preventDefault();
      dropColumn();
    },
  });
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <OrgListColumnMenu
          addColumn={
            canManageCandidates && roleId
              ? { busy: chat.isStreaming, onRequest: requestColumn }
              : undefined
          }
          columns={orderedColumns.map((column) => ({
            id: column.id,
            label: column.label,
            removable: Boolean(column.removable && canManageCandidates),
          }))}
          hidden={hidden}
          onDelete={(id) => remove.mutate(id.replace(/^custom:/, ""))}
          onHiddenChange={setHidden}
          removing={remove.isPending}
        />
      </div>
      <div className="relative">
        {overflow.right ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 z-20 w-10 bg-gradient-to-l from-bg-default to-transparent"
          />
        ) : null}
        <div
          className="relative overflow-x-auto pb-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-neutral-300 hover:[&::-webkit-scrollbar-thumb]:bg-neutral-400 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:h-2"
          ref={scrollRef}
        >
          <table className="w-max min-w-full border-separate border-spacing-0 text-left">
            <thead>
              <tr className="text-[12px] text-neutral-muted [&>th]:align-bottom">
                {selectable ? (
                  <th
                    className={cn(
                      stickyCell,
                      "left-0 w-9 border-b border-neutral-1000-a05 py-2.5 pl-2"
                    )}
                  >
                    <span className="sr-only">{c("선택", "Select")}</span>
                  </th>
                ) : null}
                <th
                  className={cn(
                    stickyCell,
                    selectable ? "left-9" : "left-0",
                    "min-w-56 border-b border-r border-neutral-1000-a05 py-2.5 pl-2 pr-4 font-normal"
                  )}
                >
                  {c("후보자", "Candidate")}
                </th>
                {visibleColumns.map((column) => (
                  <th
                    {...headerDragProps(column.id)}
                    className={cn(
                      column.headerClassName,
                      "cursor-grab border-b border-neutral-1000-a05 py-2.5 font-normal active:cursor-grabbing",
                      dragId === column.id && "opacity-40"
                    )}
                    key={column.id}
                    style={
                      dropAt?.id === column.id
                        ? {
                            boxShadow: `inset ${dropAt.side === "before" ? 2 : -2}px 0 0 0 var(--color-neutral-900)`,
                          }
                        : undefined
                    }
                  >
                    {column.header}
                  </th>
                ))}
                {pending ? (
                  <th className="min-w-44 border-b border-neutral-1000-a05 px-3 py-2.5 font-normal">
                    <span className="flex items-center gap-1.5 leading-4">
                      <LoaderCircle
                        aria-hidden
                        className="size-3.5 shrink-0 animate-spin"
                      />
                      {pending}
                    </span>
                  </th>
                ) : null}
                <th className="w-20 border-b border-neutral-1000-a05 px-3 py-2.5 text-right font-normal">
                  <span className="sr-only">{c("날짜", "Date")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const selected = selectedIds.has(item.recommendationId);
                const name = sourceT(getOrgCandidateDisplayName(item));
                const rowCell = cn(
                  "border-b border-neutral-1000-a05 align-middle",
                  selected
                    ? "bg-neutral-200"
                    : "bg-bg-default group-hover/row:bg-bg-weak"
                );
                return (
                  <tr
                    className="group/row cursor-pointer"
                    key={item.recommendationId}
                    onClick={() => onOpen(item)}
                  >
                    {selectable ? (
                      <td
                        className={cn(rowCell, "sticky left-0 z-10 py-4 pl-2")}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Checkbox
                          aria-label={c("{p0} 선택", "Select {p0}", {
                            p0: name,
                          })}
                          checked={selected}
                          onChange={(event) =>
                            onToggleSelected?.(item, event.target.checked)
                          }
                        />
                      </td>
                    ) : null}
                    <td
                      className={cn(
                        rowCell,
                        "sticky z-10 border-r py-4 pl-2 pr-4",
                        selectable ? "left-9" : "left-0"
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-bg-weak text-sm text-neutral-muted">
                          {name.slice(0, 1) || "·"}
                          {item.talent.profilePicture ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              alt=""
                              className="absolute inset-0 size-full object-cover"
                              onError={(event) => {
                                event.currentTarget.style.display = "none";
                              }}
                              src={item.talent.profilePicture}
                            />
                          ) : null}
                        </span>
                        <div className="min-w-0">
                          <button
                            className="block max-w-56 truncate text-left text-[14px] font-medium text-neutral-primary outline-none focus-visible:underline"
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpen(item);
                            }}
                            type="button"
                          >
                            {name}
                          </button>
                          {item.talent.location ? (
                            <div className="mt-0.5 max-w-56 truncate text-[12px] text-neutral-muted">
                              {item.talent.location}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    {visibleColumns.map((column) => (
                      <td
                        className={cn(rowCell, column.cellClassName)}
                        key={column.id}
                        onClick={
                          column.keepClicks
                            ? (event) => event.stopPropagation()
                            : undefined
                        }
                      >
                        {column.cell(item)}
                      </td>
                    ))}
                    {pending ? (
                      <td className={cn(rowCell, "px-3 py-4")}>
                        <Skeleton className="h-3 w-24" />
                      </td>
                    ) : null}
                    <td
                      className={cn(
                        rowCell,
                        "px-3 py-4 text-right text-[12px] text-neutral-soft"
                      )}
                    >
                      {formatKstRelativeDate(getOrgCandidateCardDate(item), {
                        locale,
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
