import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { getHarperOwnedUrlRoute } from "@/lib/urlDisplay";
import { getCareerDocumentHref } from "@/lib/career/documentLinks";
import { DocumentPreviewCards } from "../chat/elements/DocumentPreviewCards";
import { OpportunityReviews } from "../history/OpportunityReviews";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Bookmark,
  Archive,
  FileText,
  ExternalLink,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { MuteButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Typography } from "@/components/ui/typography";
import RichText from "@/components/ui/rich-text";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCareerSidebarContext } from "../CareerSidebarContext";
import { useCareerT } from "@/i18n/useCareerT";
import {
  careerResourceQueryOptions,
  careerCollectionQueryOptions,
  useCareerResourceMutation,
} from "@/hooks/career/useCareerResources";
import { getSavedOpportunityStatusLabel } from "../history/savedOpportunityStatus";
import type { ApplicationShelf, CareerOpportunity } from "@/lib/career/opportunities/store";
import type { CareerView } from "@/lib/career/resources/views";
import type { ResourceItem, ResourceRef } from "@/lib/career/resources/types";

function ResourceText({ children }: { children: string }) {
  const router = useRouter();
  return (
    <RichText
      variant="career"
      responsiveTables
      onHarperLinkClick={(href) => {
        const route = getHarperOwnedUrlRoute(href);
        if (route) void router.push(route);
      }}
    >
      {children}
    </RichText>
  );
}

const valueText = (value: unknown): string =>
  value === null || value === undefined
    ? "—"
    : Array.isArray(value)
      ? value.map(valueText).join(" · ")
      : typeof value === "object"
        ? Object.entries(value)
            .map(([key, item]) => `${key}: ${valueText(item)}`)
            .join(" · ")
        : String(value);
function sourceUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
export function resourceHref(ref: ResourceRef) {
  if (ref.kind === "opportunity")
    return `/career/opportunities/${encodeURIComponent(ref.id)}`;
  if (ref.kind === "document") return getCareerDocumentHref(ref.id);
  return `/career/resources/${ref.kind}/${encodeURIComponent(ref.id)}${ref.revision ? `?revision=${encodeURIComponent(ref.revision)}` : ""}`;
}
function ErrorMessage({
  error,
  refresh,
}: {
  error: unknown;
  refresh?: () => void;
}) {
  const t = useCareerT();
  const status =
    error && typeof error === "object" && "status" in error
      ? error.status
      : null;
  return error ? (
    <div className="space-y-2">
      <Typography role="alert" variant="description" className="text-critical">
        {status === 409
          ? t(
              "career.resources.changed",
              "자료가 변경됐어요. 현재 내용을 확인한 뒤 다시 진행해 주세요."
            )
          : status === 404
            ? t("career.resources.unavailable", "현재 읽을 수 없음")
            : t(
                "career.resources.failed",
                "불러오지 못했어요. 잠시 후 다시 시도해 주세요."
              )}
      </Typography>
      {refresh ? (
        <MuteButton onClick={refresh}>
          {t("career.resources.refresh", "새로고침")}
        </MuteButton>
      ) : null}
    </div>
  ) : null;
}
function ResourceReference({
  userId,
  refValue,
}: {
  userId: string;
  refValue: ResourceRef;
}) {
  const t = useCareerT();
  const query = useQuery(
    careerResourceQueryOptions<{ item: ResourceItem }>(userId, {
      format: "resource",
      kind: refValue.kind,
      id: refValue.id,
      ...(refValue.revision ? { revision: refValue.revision } : {}),
    })
  );
  const source = query.data?.item;
  const url = sourceUrl(source?.facts.url ?? source?.facts.website_url);
  return (
    <li className="min-w-0">
      <Link
        href={resourceHref(refValue)}
        className="flex min-h-11 items-center gap-3 rounded-md p-2 text-link hover:bg-bg-weak focus-visible:outline-2 focus-visible:outline-stroke-focus"
      >
        <FileText className="size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          {query.isLoading ? (
            <Skeleton className="h-4 w-40" />
          ) : (
            <Typography
              as="span"
              variant="description"
              className="block break-words text-inherit"
            >
              {source?.status === "available"
                ? source.title
                : t("career.resources.unavailable", "현재 읽을 수 없음")}
            </Typography>
          )}
          {url ? (
            <Typography as="span" variant="caption" className="block">
              {new URL(url).hostname}
            </Typography>
          ) : null}
        </div>
        <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
      </Link>
    </li>
  );
}
function ResourceReferences({
  userId,
  refs,
}: {
  userId: string;
  refs: ResourceRef[];
}) {
  const t = useCareerT();
  const unique = [
    ...new Map(
      refs.map((ref) => [`${ref.kind}:${ref.id}:${ref.revision ?? ""}`, ref])
    ).values(),
  ];
  return unique.length ? (
    <section
      className="space-y-1 border-t border-stroke-subtle pt-4"
      aria-label={t("career.resources.evidence", "근거")}
    >
      <Typography as="h3" variant="label">
        {t("career.resources.evidence", "근거")}
      </Typography>
      <ul className="grid gap-x-4 sm:grid-cols-2">
        {unique.map((ref) => (
          <ResourceReference
            key={`${ref.kind}:${ref.id}:${ref.revision ?? ""}`}
            userId={userId}
            refValue={ref}
          />
        ))}
      </ul>
    </section>
  ) : null;
}
function ActionRequest({
  userId,
  kind,
  id,
  revision,
  action,
  selection,
  onBusy,
}: {
  userId: string;
  kind: "view" | "opportunity";
  id: string;
  revision: number;
  action: { id: string; label: string; request: string };
  selection?: { itemIds?: string[]; excludeItemIds?: string[] };
  onBusy?: (busy: boolean) => void;
}) {
  const mutation = useCareerResourceMutation(userId),
    router = useRouter();
  const client = useQueryClient();
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const run = async () => {
    onBusy?.(true);
    try {
      const result = await mutation.mutateAsync({
        action: "interact",
        interaction: {
          requestId,
          kind,
          id,
          expectedRevision: revision,
          actionId: action.id,
          selection,
        },
      });
      setRequestId(crypto.randomUUID());
      if (result.accepted)
        await router.push({
          pathname: "/career/chat",
          query: { conversationId: result.conversationId },
        });
    } finally {
      onBusy?.(false);
    }
  };
  return (
    <Card className="space-y-3 p-4">
      <Typography variant="description">{action.request}</Typography>
      <MuteButton
        variant="primary"
        size="lg"
        disabled={mutation.isPending}
        onClick={() => void run().catch(() => undefined)}
      >
        {action.label}
        <ArrowRight className="size-4" />
      </MuteButton>
      <ErrorMessage
        error={mutation.error}
        refresh={() =>
          void client.invalidateQueries({
            queryKey: queryKeys.careerResources.all(userId),
          })
        }
      />
    </Card>
  );
}
function actionFrom(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" &&
    typeof v.label === "string" &&
    typeof v.request === "string"
    ? { id: v.id, label: v.label, request: v.request }
    : null;
}
export function OpportunityDetail({
  userId,
  id,
}: {
  userId: string;
  id: string;
}) {
  const t = useCareerT(),
    query = useQuery(
      careerResourceQueryOptions<{ item: CareerOpportunity }>(userId, {
        kind: "opportunity",
        id,
      })
    );
  const mutation = useCareerResourceMutation(userId),
    item = query.data?.item;
  if (!item)
    return (
      <>
        {query.isLoading ? <Skeleton className="h-44 w-full" /> : null}
        <ErrorMessage
          error={query.error}
          refresh={() => void query.refetch()}
        />
      </>
    );
  const action = actionFrom(item.presentation.action);
  const mutate = (patch: Record<string, unknown>) =>
    mutation.mutate({
      action: "opportunity",
      id: item.id,
      expectedRevision: item.revision,
      requestId: crypto.randomUUID(),
      patch,
    });
  return (
    <article className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <Typography
          as="h1"
          variant="page-title"
          className="min-w-0 break-words"
        >
          {item.title}
        </Typography>
        <div className="flex flex-wrap gap-2">
          <MuteButton
            disabled={mutation.isPending}
            aria-pressed={Boolean(item.saved_at)}
            onClick={() => mutate({ saved: !item.saved_at })}
          >
            <Bookmark className="size-4" />
            {item.saved_at
              ? t("career.resources.saved", "저장됨")
              : t("career.resources.save", "저장")}
          </MuteButton>
          <MuteButton
            disabled={mutation.isPending}
            onClick={() => mutate({ archived: !item.archived_at })}
          >
            <Archive className="size-4" />
            {item.archived_at
              ? t("career.resources.restore", "다시 표시")
              : t("career.resources.archive", "숨기기")}
          </MuteButton>
          {item.recommendation_id &&
          (item.legacy_role_id || item.primary_ref.kind === "role") ? (
            <MuteButton asChild>
              <Link
                href={`/career/history?historyTab=saved&id=${encodeURIComponent(item.legacy_role_id ?? item.primary_ref.id)}`}
              >
                {t("career.resources.progress", "지원·소개 진행 내역")}
              </Link>
            </MuteButton>
          ) : null}
        </div>
      </header>
      <ErrorMessage
        error={mutation.error ?? query.error}
        refresh={() => void query.refetch()}
      />
      {item.application_stage && <p>{getSavedOpportunityStatusLabel(item.application_stage, t)}</p>}
      <ResourceText>{item.body}</ResourceText>
      <OpportunityReviews opportunityId={item.id}
        roleId={item.legacy_role_id ?? (item.primary_ref.kind === "role" ? item.primary_ref.id : undefined)} />
      <ResourceReferences
        userId={userId}
        refs={[item.primary_ref, ...item.evidence_refs]}
      />
      {item.work?.length ? (
        <section className="space-y-3">
          <Typography as="h3" variant="title">
            {t("career.resources.work", "맡긴 진행")}
          </Typography>
          {item.work.map((work) => (
            <Card key={work.id} className="space-y-3 p-4">
              <Typography variant="label" className="text-action">
                {work.status === "completed"
                  ? t("career.resources.work_completed", "완료")
                  : work.status === "cancelled"
                    ? t("career.resources.work_cancelled", "중단됨")
                    : work.status === "waiting"
                      ? t("career.resources.work_waiting", "후속 확인 대기")
                      : t("career.resources.work_active", "진행 중")}
              </Typography>
              <ResourceText>{work.title}</ResourceText>
              {work.note ? <ResourceText>{work.note}</ResourceText> : null}
              {work.conversationId ? (
                <Link
                  className="text-link underline underline-offset-4"
                  href={`/career/chat?conversationId=${encodeURIComponent(work.conversationId)}`}
                >
                  {t("career.resources.work_conversation", "진행 대화 열기")}
                </Link>
              ) : null}
            </Card>
          ))}
        </section>
      ) : null}
      {action ? (
        <ActionRequest
          userId={userId}
          kind="opportunity"
          id={item.id}
          revision={item.revision}
          action={action}
        />
      ) : null}
    </article>
  );
}
function CollectionBlock({
  userId,
  view,
  block,
}: {
  userId: string;
  view: CareerView;
  block: Extract<
    CareerView["definition"]["blocks"][number],
    { type: "collection" }
  >;
}) {
  const t = useCareerT();
  const query = useInfiniteQuery(
    careerCollectionQueryOptions(userId, {
      kind: "collection",
      id: view.id,
      revision: String(view.revision),
      blockId: block.id,
    })
  );
  const client = useQueryClient(),
    selectionKey = queryKeys.careerResources.selection(
      userId,
      view.id,
      block.id
    );
  const initial = {
    revision: view.revision,
    all: false,
    included: [] as string[],
    excluded: [] as string[],
  };
  const [selectionState, setSelectionState] = useState(
    () => client.getQueryData<typeof initial>(selectionKey) ?? initial
  );
  const {
    all,
    included,
    excluded,
    revision: selectedRevision,
  } = selectionState;
  const setSelection = (patch: Partial<typeof initial>) => {
    const next = { ...selectionState, ...patch };
    setSelectionState(next);
    client.setQueryData(selectionKey, next);
  };
  const [busy, setBusy] = useState(false);
  const stale = selectedRevision !== view.revision;
  const items = query.data?.pages.flatMap((page) => page.items) ?? [],
    total = query.data?.pages[0]?.total ?? null;
  const selected = (id: string) =>
    all ? !excluded.includes(id) : included.includes(id);
  const toggle = (id: string) =>
    all
      ? setSelection({
          excluded: excluded.includes(id)
            ? excluded.filter((x) => x !== id)
            : [...excluded, id],
        })
      : setSelection({
          included: included.includes(id)
            ? included.filter((x) => x !== id)
            : [...included, id],
        });
  const count =
    all && total !== null ? total - excluded.length : included.length;
  const fields = (
    block.columns ??
    (query.data?.pages[0]?.manifest.fields as string[] | undefined) ??
    []
  ).filter((field) => field !== "title" && field !== "name");
  return (
    <section className="space-y-3">
      {block.title ? (
        <Typography as="h3" variant="title">
          {block.title}
        </Typography>
      ) : null}
      {block.action ? (
        <div className="flex items-center justify-between gap-4">
          <Checkbox
            className="min-h-11"
            label={t("career.resources.select_all", "전체 선택")}
            checked={all && excluded.length === 0}
            indeterminate={count > 0 && !(all && excluded.length === 0)}
            disabled={busy || stale}
            onChange={(event) =>
              setSelection({
                all: event.target.checked,
                included: [],
                excluded: [],
              })
            }
          />
          <Typography variant="caption" role="status" aria-live="polite">
            {count} / {total ?? "—"}
          </Typography>
        </div>
      ) : null}
      {block.action && count > 0 && !stale ? (
        <ActionRequest
          key={JSON.stringify({
            revision: view.revision,
            action: block.action.id,
            all,
            included,
            excluded,
          })}
          onBusy={setBusy}
          userId={userId}
          kind="view"
          id={view.id}
          revision={view.revision}
          action={block.action}
          selection={all ? { excludeItemIds: excluded } : { itemIds: included }}
        />
      ) : null}
      {query.isLoading ? <Skeleton className="h-32 w-full" /> : null}
      {total === 0 ? (
        <Typography variant="description">
          {t("career.resources.empty", "아직 표시할 자료가 없어요.")}
        </Typography>
      ) : null}
      {block.layout === "table" && total !== 0 ? (
        <div className="max-w-full rounded-md border border-stroke-subtle sm:max-h-[60vh] sm:overflow-auto">
          <Table className="block sm:table">
            <TableHeader className="hidden bg-bg-default sm:table-header-group">
              <TableRow>
                {block.action ? (
                  <TableHead>
                    <span className="sr-only">
                      {t("career.resources.selection", "선택")}
                    </span>
                  </TableHead>
                ) : null}
                <TableHead>{t("career.resources.resource", "대상")}</TableHead>
                {fields.map((field) => (
                  <TableHead key={field}>{field}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody className="block sm:table-row-group">
              {items.map((item) => (
                <TableRow
                  key={item.itemId}
                  className={cn(
                    "grid gap-x-2 p-3 sm:table-row sm:p-0",
                    block.action
                      ? "grid-cols-[44px_minmax(0,1fr)]"
                      : "grid-cols-1"
                  )}
                >
                  {block.action ? (
                    <TableCell className="flex items-start p-0 sm:table-cell sm:w-12 sm:p-2">
                      <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
                        <Checkbox
                          size="medium"
                          aria-label={`${valueText(item.projection.title ?? item.projection.name ?? item.ref.id)} ${t("career.resources.selection", "선택")}`}
                          checked={selected(item.itemId)}
                          disabled={item.unavailable || busy || stale}
                          onChange={() => toggle(item.itemId)}
                        />
                      </label>
                    </TableCell>
                  ) : null}
                  <TableCell className="min-w-0 p-0 sm:min-w-40 sm:p-2">
                    <Link
                      className="inline-flex min-h-11 items-center break-words text-link"
                      href={resourceHref(item.ref)}
                    >
                      {valueText(
                        item.projection.title ??
                          item.projection.name ??
                          item.ref.id
                      )}
                    </Link>
                  </TableCell>
                  {fields.map((field) => (
                    <TableCell
                      key={field}
                      className={cn(
                        "min-w-0 whitespace-normal px-0 py-2 sm:min-w-36 sm:p-2",
                        block.action && "col-start-2"
                      )}
                    >
                      <Typography
                        as="span"
                        variant="caption"
                        className="mb-1 block sm:hidden"
                      >
                        {field}
                      </Typography>
                      {item.unavailable
                        ? t("career.resources.unavailable", "현재 읽을 수 없음")
                        : valueText(item.projection[field])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.itemId} className="flex items-start gap-3 py-3">
              {block.action ? (
                <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
                  <Checkbox
                    size="medium"
                    aria-label={`${valueText(item.projection.title ?? item.projection.name ?? item.ref.id)} ${t("career.resources.selection", "선택")}`}
                    checked={selected(item.itemId)}
                    disabled={item.unavailable || busy || stale}
                    onChange={() => toggle(item.itemId)}
                  />
                </label>
              ) : null}
              <div className="min-w-0 space-y-2">
                <Link className="text-link" href={resourceHref(item.ref)}>
                  {valueText(
                    item.projection.title ?? item.projection.name ?? item.ref.id
                  )}
                </Link>
                {item.unavailable ? (
                  <Typography variant="description">
                    {t("career.resources.unavailable", "현재 읽을 수 없음")}
                  </Typography>
                ) : (
                  fields
                    .filter((field) => field !== "title" && field !== "name")
                    .map((field) => (
                      <Typography key={field} variant="description">
                        {field}: {valueText(item.projection[field])}
                      </Typography>
                    ))
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ErrorMessage error={query.error} refresh={() => void query.refetch()} />
      {stale ? (
        <div className="space-y-2">
          <Typography role="status" variant="description">
            {t(
              "career.resources.selection_changed",
              "목록이 바뀌었어요. 이전 선택을 유지하고 있습니다."
            )}
          </Typography>
          <MuteButton onClick={() => setSelection(initial)}>
            {t("career.resources.select_current", "현재 목록에서 다시 선택")}
          </MuteButton>
        </div>
      ) : null}
      {query.hasNextPage ? (
        <MuteButton
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t("career.resources.more", "더 보기")}
        </MuteButton>
      ) : null}
    </section>
  );
}
export function SourceBlock({
  userId,
  refValue,
}: {
  userId: string;
  refValue: ResourceRef;
}) {
  const query = useQuery(
      careerResourceQueryOptions<{ item: ResourceItem }>(userId, {
        format: "resource",
        kind: refValue.kind,
        id: refValue.id,
        ...(refValue.revision ? { revision: refValue.revision } : {}),
      })
    ),
    t = useCareerT();
  if (!query.data)
    return (
      <>
        {query.isLoading ? <Skeleton className="h-28 w-full" /> : null}
        <ErrorMessage
          error={query.error}
          refresh={() => void query.refetch()}
        />
      </>
    );
  const source = query.data.item;
  return (
    <section className="space-y-3">
      <Typography as="h3" variant="title">
        {source.title}
      </Typography>
      {source.status !== "available" ? (
        <Typography variant="description">
          {t("career.resources.unavailable", "현재 읽을 수 없음")}
        </Typography>
      ) : (
        <>
          {refValue.kind === "document" ? (
            <DocumentPreviewCards
              documents={[{ id: refValue.id, title: source.title }]}
            />
          ) : (
            <ResourceText>{source.body}</ResourceText>
          )}
          <dl className="space-y-2">
            {Object.entries(source.facts)
              .filter(
                ([key]) =>
                  ![
                    "threadId",
                    "status",
                    "id",
                    "role_id",
                    "company_workspace_id",
                  ].includes(key)
              )
              .map(([key, value]) =>
                value === null ? null : (
                  <div key={key} className="flex flex-wrap gap-2">
                    <dt className="text-neutral-muted">
                      {t(
                        `career.resources.fact.${key}`,
                        key.replaceAll("_", " ")
                      )}
                    </dt>
                    <dd className="break-words">
                      {/At$/.test(key) &&
                      typeof value === "string" &&
                      !Number.isNaN(Date.parse(value)) ? (
                        new Date(value).toLocaleString()
                      ) : sourceUrl(value) ? (
                        <a
                          className="inline-flex min-h-11 items-center gap-1 break-all text-link underline underline-offset-4"
                          href={sourceUrl(value)!}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {valueText(value)}
                          <ExternalLink
                            className="size-3.5 shrink-0"
                            aria-hidden="true"
                          />
                        </a>
                      ) : (
                        valueText(value)
                      )}
                    </dd>
                  </div>
                )
              )}
          </dl>
        </>
      )}
      <ResourceReferences
        userId={userId}
        refs={source.sourceRefs.filter(
          (ref) => ref.kind !== refValue.kind || ref.id !== refValue.id
        )}
      />
    </section>
  );
}
export function ViewDetail({ userId, id }: { userId: string; id: string }) {
  const t = useCareerT(),
    mutation = useCareerResourceMutation(userId);
  const query = useQuery(
    careerResourceQueryOptions<{ item: CareerView }>(userId, {
      kind: "view",
      id,
    })
  );
  if (!query.data)
    return (
      <>
        {query.isLoading ? <Skeleton className="h-44 w-full" /> : null}
        <ErrorMessage
          error={query.error}
          refresh={() => void query.refetch()}
        />
      </>
    );
  const view = query.data.item;
  return (
    <article className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <Typography
          as="h1"
          variant="page-title"
          className="min-w-0 break-words"
        >
          {view.title}
        </Typography>
        <MuteButton
          disabled={mutation.isPending}
          onClick={() =>
            mutation.mutate({
              action: "view",
              id: view.id,
              expectedRevision: view.revision,
              requestId: crypto.randomUUID(),
              archived: !view.archived_at,
            })
          }
        >
          <Archive className="size-4" />
          {view.archived_at
            ? t("career.resources.restore", "다시 표시")
            : t("career.resources.archive", "숨기기")}
        </MuteButton>
      </header>
      <ErrorMessage
        error={mutation.error ?? query.error}
        refresh={() => void query.refetch()}
      />
      {view.description ? (
        <ResourceText>{view.description}</ResourceText>
      ) : null}
      {view.definition.blocks.map((block) =>
        block.type === "narrative" ? (
          <section key={block.id} className="space-y-3">
            {block.title ? (
              <Typography as="h2" variant="title">
                {block.title}
              </Typography>
            ) : null}
            <ResourceText>{block.markdown}</ResourceText>
            <ResourceReferences userId={userId} refs={block.sourceRefs} />
          </section>
        ) : block.type === "collection" ? (
          <CollectionBlock
            key={`${userId}:${block.id}:${view.revision}`}
            userId={userId}
            view={view}
            block={block}
          />
        ) : block.type === "document" ? (
          <SourceBlock key={block.id} userId={userId} refValue={block.ref} />
        ) : (
          <section key={block.id} className="space-y-4">
            {block.refs.map((ref) => (
              <SourceBlock
                key={`${ref.kind}:${ref.id}`}
                userId={userId}
                refValue={ref}
              />
            ))}
          </section>
        )
      )}
    </article>
  );
}
export function ResourceOrderButtons({
  userId,
  kind,
  item,
}: {
  userId: string;
  kind: "opportunity" | "view";
  item: { id: string; revision: number; title: string };
}) {
  const mutation = useCareerResourceMutation(userId),
    t = useCareerT();
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {(["up", "down"] as const).map((direction) => (
          <MuteButton
            key={direction}
            disabled={mutation.isPending}
            aria-label={`${item.title}: ${direction === "up" ? t("career.resources.move_up", "위로 이동") : t("career.resources.move_down", "아래로 이동")}`}
            onClick={() =>
              mutation.mutate({
                action: "move",
                kind,
                id: item.id,
                expectedRevision: item.revision,
                direction,
              })
            }
          >
            {direction === "up" ? (
              <ArrowUp className="size-4" />
            ) : (
              <ArrowDown className="size-4" />
            )}
          </MuteButton>
        ))}
      </div>
      <ErrorMessage error={mutation.error} />
    </div>
  );
}
export function CareerResourceShelf({
  saved = false,
  archived = false,
  applicationShelf,
  emptyContent,
}: {
  saved?: boolean;
  archived?: boolean;
  applicationShelf?: ApplicationShelf;
  emptyContent?: ReactNode;
}) {
  const router = useRouter();
  const cursor =
    router.asPath.startsWith("/career/opportunities") &&
    typeof router.query.cursor === "string"
      ? router.query.cursor
      : undefined;
  const { user } = useCareerSidebarContext(),
    userId = user?.id ?? "",
    t = useCareerT();
  const opportunities = useQuery(
    careerResourceQueryOptions<{
      items: CareerOpportunity[];
      nextCursor: string | null;
    }>(userId, {
      kind: "opportunity",
      unbound: "true",
      ...(applicationShelf ? { applicationShelf } : {}),
      ...(cursor ? { cursor } : {}),
      ...(archived ? {} : { saved: String(saved) }),
      archived: String(archived),
    })
  );
  const views = useQuery({
    ...careerResourceQueryOptions<{
      items: CareerView[];
      nextCursor: string | null;
    }>(userId, {
      kind: "view",
      archived: String(archived),
      ...(typeof router.query.viewsCursor === "string"
        ? { cursor: router.query.viewsCursor }
        : {}),
    }),
    enabled: Boolean(userId) && !applicationShelf,
  });
  const items =
    opportunities.data?.items.filter((item) => !item.recommendation_id) ?? [];
  return (
    <section className="space-y-3">
      {opportunities.isSuccess &&
      (applicationShelf || views.isSuccess) &&
      !items.length &&
      (applicationShelf || !views.data?.items.length)
        ? (emptyContent !== undefined ? emptyContent : (
            <Typography variant="description">
              {t("career.resources.empty", "아직 표시할 자료가 없어요.")}
            </Typography>
          ))
        : null}
      <ErrorMessage
        error={opportunities.error ?? (applicationShelf ? null : views.error)}
        refresh={() => {
          void opportunities.refetch();
          if (!applicationShelf) void views.refetch();
        }}
      />
      {opportunities.isLoading || (!applicationShelf && views.isLoading) ? (
        <Skeleton className="h-28 w-full" />
      ) : null}
      {!applicationShelf && views.data?.items.map((view) => (
        <div key={view.id} className="flex items-center gap-2">
          <Link
            href={`/career/views/${view.id}`}
            className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 rounded-md bg-bg-floating p-4"
          >
            <Typography as="span" variant="title">
              {view.title}
            </Typography>
            <ArrowRight className="size-4 shrink-0" />
          </Link>
          <ResourceOrderButtons userId={userId} kind="view" item={view} />
        </div>
      ))}
      {items.map((item) => (
        <Card key={item.id} className="space-y-3 p-4">
          <Link
            href={`/career/opportunities/${item.id}`}
            className="flex min-h-11 items-center justify-between gap-3 text-neutral-primary hover:text-link focus-visible:outline-2 focus-visible:outline-stroke-focus"
          >
            <Typography as="h3" variant="title">
              {item.title}
            </Typography>
            <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
          </Link>
          {item.application_stage && <p>{getSavedOpportunityStatusLabel(item.application_stage, t)}</p>}
          {item.body ? (
            <details className="group">
              <summary className="min-h-11 cursor-pointer content-center text-sm text-neutral-muted focus-visible:outline-2 focus-visible:outline-stroke-focus">
                {t("career.resources.rationale", "추천 이유")}
              </summary>
              <ResourceText>{item.body}</ResourceText>
            </details>
          ) : null}
          {!applicationShelf && (
            <ResourceOrderButtons userId={userId} kind="opportunity" item={item} />
          )}
        </Card>
      ))}
      {opportunities.data?.nextCursor ? (
        <Link
          className="text-link"
          href={`/career/opportunities?${new URLSearchParams({ cursor: opportunities.data.nextCursor, ...(applicationShelf ? { applicationShelf } : {}), saved: String(saved), archived: String(archived) })}`}
        >
          {t("career.resources.more", "더 보기")}
        </Link>
      ) : null}
      {!applicationShelf && views.data?.nextCursor ? (
        <Link
          className="text-link"
          href={`/career/opportunities?${new URLSearchParams({ viewsCursor: views.data.nextCursor, saved: String(saved), archived: String(archived) })}`}
        >
          {t("career.resources.more_views", "비교 목록 더 보기")}
        </Link>
      ) : null}
    </section>
  );
}
export default function CareerResourcePanel() {
  const { user } = useCareerSidebarContext(),
    router = useRouter(),
    t = useCareerT();
  const path = router.asPath.split("?")[0].split("/"),
    kind = path[2],
    id = decodeURIComponent(path[3] ?? "");
  const userId = user?.id ?? "";
  return (
    <div className="min-w-0 space-y-5 pb-8">
      <MuteButton asChild>
        <Link href="/career/history">
          <ArrowLeft className="size-4" />
          {t("career.resources.back", "기회 목록")}
        </Link>
      </MuteButton>
      {kind === "opportunities" && id ? (
        <OpportunityDetail userId={userId} id={id} />
      ) : kind === "views" && id ? (
        <ViewDetail userId={userId} id={id} />
      ) : kind === "resources" && path[4] ? (
        <SourceBlock
          userId={userId}
          refValue={{
            kind: id as ResourceRef["kind"],
            id: decodeURIComponent(path[4]),
            ...(typeof router.query.revision === "string"
              ? { revision: router.query.revision }
              : {}),
          }}
        />
      ) : (
        <CareerResourceShelf
          applicationShelf={router.query.applicationShelf === "applied" || router.query.applicationShelf === "hidden" ? router.query.applicationShelf : undefined}
          saved={router.query.saved === "true"}
          archived={router.query.archived === "true"}
        />
      )}
    </div>
  );
}
