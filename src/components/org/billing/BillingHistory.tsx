import TalentCareerModal from "@/components/common/TalentCareerModal";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Download,
} from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OrgSection, OrgSectionHeader } from "../workspace/OrgSection";
import {
  orgBillingInvoicesOptions,
  orgBillingUsageOptions,
} from "@/hooks/org/useOrgBilling";
import { formatBillingMoney } from "@/lib/org/billing/types";
import type { BillingInvoice } from "@/lib/org/billing/types";
import { useOrgBillingPreview } from "@/store/useOrgBillingPreviewStore";

type HistoryProps = {
  workspaceId: string;
  locale: "ko" | "en";
  date: (value: string | null, time?: boolean) => string;
};
const rowClass = "border-neutral-1000-a05 hover:bg-transparent";
const cellClass = "px-5 py-3 text-[13px]";

function HistoryState({
  loading,
  error,
  empty,
  columns,
  locale,
  onRetry,
}: {
  loading: boolean;
  error: boolean;
  empty: string;
  columns: number;
  locale: "ko" | "en";
  onRetry: () => void;
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={columns}
        className="h-40 px-5 text-center text-[13px] text-neutral-muted"
      >
        <div className="sticky left-5 w-[calc(100vw-74px)] whitespace-normal sm:static sm:w-auto">
          {loading ? (
            <Skeleton
              className="mx-auto h-4 w-44"
              aria-label={locale === "ko" ? "불러오는 중" : "Loading"}
            />
          ) : error ? (
            <div role="alert">
              <p>
                {locale === "ko"
                  ? "내역을 불러오지 못했어요."
                  : "History couldn’t be loaded."}
              </p>
              <MuteButton className="mt-3" onClick={onRetry}>
                {locale === "ko" ? "다시 시도" : "Try again"}
              </MuteButton>
            </div>
          ) : (
            empty
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function HistoryPagination({
  page,
  pageCount,
  busy,
  hasMore,
  locale,
  onPrevious,
  onNext,
}: {
  page: number;
  pageCount?: number;
  busy: boolean;
  hasMore: boolean;
  locale: "ko" | "en";
  onPrevious: () => void;
  onNext: () => void;
}) {
  const c = (ko: string, en: string) => (locale === "ko" ? ko : en);
  return (
    <nav
      aria-label={c("내역 페이지", "History pages")}
      className="mt-4 flex items-center justify-between gap-3 text-[12px] text-neutral-muted"
    >
      <span></span>
      <div className="flex items-center gap-2">
        <MuteButton
          size="sm"
          variant="transparent"
          disabled={busy || page === 0}
          onClick={onPrevious}
          aria-label={c("이전 페이지", "Previous page")}
        >
          <ChevronLeft className="size-4" />
        </MuteButton>
        <span className="min-w-12 text-center tabular-nums" aria-live="polite">
          {page + 1}
          {pageCount ? ` / ${pageCount}` : ""}
        </span>
        <MuteButton
          size="sm"
          variant="transparent"
          disabled={busy || !hasMore}
          onClick={onNext}
          aria-label={c("다음 페이지", "Next page")}
        >
          <ChevronRight className="size-4" />
        </MuteButton>
      </div>
    </nav>
  );
}

export function BillingUsageHistory({
  workspaceId,
  locale,
  date,
}: HistoryProps) {
  const c = (ko: string, en: string) => (locale === "ko" ? ko : en);
  const [page, setPage] = useState(0);
  const { preview } = useOrgBillingPreview(workspaceId);
  const usage = useQuery({
    ...orgBillingUsageOptions(workspaceId, page, preview),
    placeholderData: keepPreviousData,
  });
  const rows = usage.data?.usage ?? [];
  const pageCount = Math.max(1, Math.ceil((usage.data?.total ?? 0) / 20));
  return (
    <OrgSection className="border-b-0 pb-0">
      <OrgSectionHeader title={c("크레딧 사용 내역", "Credit usage history")} />
      <div
        className="overflow-hidden rounded-xl border border-neutral-1000-a05"
        aria-busy={usage.isFetching}
      >
        <Table
          className={`min-w-[600px] ${usage.isPlaceholderData ? "opacity-50" : ""}`}
        >
          <TableHeader className="bg-bg-weak">
            <TableRow className={rowClass}>
              {[
                c("사용일", "Date"),
                c("활동", "Activity"),
                "Role",
                c("사용한 크레딧", "Credit source"),
                c("크레딧", "Credits"),
              ].map((label) => (
                <TableHead
                  key={label}
                  scope="col"
                  className="h-10 whitespace-nowrap px-5 text-[12px] font-normal last:text-right"
                >
                  {label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {usage.isPending || usage.isError || rows.length === 0 ? (
              <HistoryState
                loading={usage.isPending}
                error={usage.isError}
                empty={c(
                  "아직 크레딧 사용 내역이 없어요.",
                  "No credit usage yet."
                )}
                columns={5}
                locale={locale}
                onRetry={() => void usage.refetch()}
              />
            ) : (
              rows.map((item) => (
                <TableRow key={item.id} className={rowClass}>
                  <TableCell
                    className={`${cellClass} whitespace-nowrap text-neutral-muted`}
                  >
                    <time
                      dateTime={item.createdAt}
                      title={date(item.createdAt, true)}
                    >
                      {date(item.createdAt, true)}
                    </time>
                  </TableCell>
                  <TableCell className={`${cellClass} whitespace-nowrap`}>
                    {item.action === "intro_request"
                      ? c("Intro 요청", "Intro request")
                      : c("연결 수락", "Connection accepted")}
                  </TableCell>
                  <TableCell className={`${cellClass} max-w-[250px]`}>
                    <span className="line-clamp-2">{item.roleName ?? "—"}</span>
                  </TableCell>
                  <TableCell
                    className={`${cellClass} whitespace-nowrap text-neutral-muted`}
                  >
                    {item.slotLabel === "Shared credits" ||
                    item.slotLabel === "Free"
                      ? c("공용 크레딧", "Shared credits")
                      : (item.slotLabel ?? "—")}
                  </TableCell>
                  <TableCell className={`${cellClass} text-right tabular-nums`}>
                    {item.delta === 0 ? (
                      <span className="text-neutral-muted">
                        {c("포함", "Included")}
                      </span>
                    ) : (
                      `−${Math.abs(item.delta)}`
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <HistoryPagination
        page={usage.isPlaceholderData ? usage.data.page : page}
        pageCount={pageCount}
        busy={usage.isFetching}
        hasMore={!usage.isError && (usage.data?.hasMore ?? false)}
        locale={locale}
        onPrevious={() => setPage((value) => Math.max(0, value - 1))}
        onNext={() => setPage((value) => value + 1)}
      />
    </OrgSection>
  );
}

export function BillingInvoiceHistory({
  workspaceId,
  locale,
  date,
}: HistoryProps) {
  const c = (ko: string, en: string) => (locale === "ko" ? ko : en);
  const [cursors, setCursors] = useState([""]);
  const { preview } = useOrgBillingPreview(workspaceId);
  const [previewInvoice, setPreviewInvoice] = useState<BillingInvoice | null>(
    null
  );
  const page = cursors.length - 1;
  const invoices = useQuery(
    orgBillingInvoicesOptions(workspaceId, cursors[page], preview)
  );
  const rows = invoices.data?.invoices ?? [];
  const statusLabel = (status: string) =>
    ({
      paid: c("결제 완료", "Paid"),
      open: c("결제 대기", "Awaiting payment"),
      void: c("취소됨", "Voided"),
      uncollectible: c("미결제", "Unpaid"),
    })[status] ?? c("확인 중", "Processing");
  return (
    <OrgSection className="border-b-0 pb-0">
      <OrgSectionHeader
        title={c("결제 내역", "Billing history")}
        description={c(
          "청구서와 결제 영수증을 확인",
          "View invoices and payment receipts."
        )}
      />
      <div
        className="overflow-hidden rounded-xl border border-neutral-1000-a05"
        aria-busy={invoices.isFetching}
      >
        <Table className="min-w-[640px]">
          <TableHeader className="bg-bg-weak">
            <TableRow className={rowClass}>
              {[
                c("플랜", "Plan"),
                c("금액", "Amount"),
                c("날짜", "Date"),
                c("결제 상태", "Payment status"),
                c("서류", "Documents"),
              ].map((label) => (
                <TableHead
                  key={label}
                  scope="col"
                  className="h-10 whitespace-nowrap px-5 text-[12px] font-normal last:text-right"
                >
                  {label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.isPending || invoices.isError || rows.length === 0 ? (
              <HistoryState
                loading={invoices.isPending}
                error={invoices.isError}
                empty={c(
                  "아직 결제 내역이 없어요. 결제 후 여기에서 서류를 받을 수 있어요.",
                  "No billing history yet. Documents will be available here after checkout."
                )}
                columns={5}
                locale={locale}
                onRetry={() => void invoices.refetch()}
              />
            ) : (
              rows.map((invoice) => (
                <TableRow key={invoice.id} className={rowClass}>
                  <TableCell className={`${cellClass} max-w-[260px]`}>
                    <p className="line-clamp-2">
                      {invoice.planName ?? "Harper Slot"}
                    </p>
                    {invoice.number && (
                      <p className="mt-1 text-[11px] text-neutral-soft">
                        {invoice.number}
                      </p>
                    )}
                  </TableCell>
                  <TableCell
                    className={`${cellClass} whitespace-nowrap tabular-nums`}
                  >
                    {formatBillingMoney(
                      invoice.status === "paid"
                        ? invoice.amountPaid
                        : invoice.amountDue,
                      invoice.currency,
                      locale
                    )}
                  </TableCell>
                  <TableCell
                    className={`${cellClass} whitespace-nowrap text-neutral-muted`}
                  >
                    {date(invoice.date)}
                  </TableCell>
                  <TableCell className={`${cellClass} whitespace-nowrap`}>
                    <Badge
                      size="sm"
                      variant="outline"
                      tone={
                        invoice.status === "open" ||
                        invoice.status === "uncollectible"
                          ? "warning"
                          : "neutral"
                      }
                    >
                      {statusLabel(invoice.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className={cellClass}>
                    <div className="flex justify-end gap-1">
                      {preview && (
                        <MuteButton
                          size="sm"
                          className="text-action"
                          variant="transparent"
                          aria-label={c(
                            `${invoice.number} 예시 청구서 보기`,
                            `View sample invoice ${invoice.number}`
                          )}
                          onClick={() => setPreviewInvoice(invoice)}
                        >
                          {c("열기", "View")}
                          <ArrowUpRight aria-hidden className="size-3" />
                        </MuteButton>
                      )}
                      {invoice.hostedUrl && (
                        <MuteButton asChild size="sm" variant="transparent">
                          <a
                            href={invoice.hostedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={c(
                              `${invoice.number ?? ""} 청구서와 영수증 보기`,
                              `View invoice and receipt ${invoice.number ?? ""}`
                            )}
                          >
                            {c("보기", "View")}
                            <ArrowUpRight className="size-3" />
                          </a>
                        </MuteButton>
                      )}
                      {invoice.pdfUrl && (
                        <MuteButton asChild size="sm" variant="transparent">
                          <a
                            href={invoice.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={c(
                              `${invoice.number ?? ""} 청구서 PDF 다운로드`,
                              `Download invoice PDF ${invoice.number ?? ""}`
                            )}
                          >
                            <Download className="size-3.5" />
                            PDF
                          </a>
                        </MuteButton>
                      )}
                      {!preview && !invoice.hostedUrl && !invoice.pdfUrl && (
                        <span className="text-neutral-soft">
                          {c("준비 중", "Pending")}
                        </span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <HistoryPagination
        page={page}
        busy={invoices.isFetching}
        hasMore={!invoices.isError && (invoices.data?.hasMore ?? false)}
        locale={locale}
        onPrevious={() => setCursors((values) => values.slice(0, -1))}
        onNext={() => {
          const next = invoices.data?.next;
          if (next) setCursors((values) => [...values, next]);
        }}
      />
      <TalentCareerModal
        open={!!previewInvoice}
        onClose={() => setPreviewInvoice(null)}
        mobileBottomSheet
        title={
          <>
            {c("예시 청구서 · ", "Sample invoice · ")}
            {previewInvoice?.number}
          </>
        }
        description={
          <>
            {c(
              "UI 확인용 예시예요. 실제 청구서나 결제 증빙이 아니에요.",
              "UI sample only. This is not a real invoice or payment receipt."
            )}
          </>
        }
        bodyClassName="space-y-4 px-4 pb-5 sm:px-5"
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <MuteButton onClick={() => setPreviewInvoice(null)}>
              {c("결제 내역으로 돌아가기", "Back to billing history")}
            </MuteButton>
          </div>
        }
      >
        {previewInvoice && (
          <dl className="grid grid-cols-2 gap-4 py-5 text-sm">
            <dt>{c("플랜", "Plan")}</dt>
            <dd>{previewInvoice.planName}</dd>
            <dt>{c("금액", "Amount")}</dt>
            <dd>
              {formatBillingMoney(
                previewInvoice.amountDue,
                previewInvoice.currency,
                locale
              )}
            </dd>
            <dt>{c("날짜", "Date")}</dt>
            <dd>{date(previewInvoice.date)}</dd>
            <dt>{c("상태", "Status")}</dt>
            <dd>{statusLabel(previewInvoice.status)}</dd>
          </dl>
        )}
      </TalentCareerModal>
    </OrgSection>
  );
}
