import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import {
  CAREER_DEV_EXTERNAL_FITS_MONTHS,
  type CareerDevExternalFitsMonths,
  type CareerDevExternalFitsPage,
} from "@/lib/career/devExternalFits";

const checkDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Seoul",
});

// career-i18n-skip: developer-only fit history viewer.
export default function CareerExternalFitsDevModal({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const { fetchWithAuth } = useCareerApi();
  const [months, setMonths] = useState<CareerDevExternalFitsMonths>(1);
  const query = useInfiniteQuery({
    queryKey: ["career-dev-external-fits", userId, months],
    initialPageParam: 0,
    queryFn: async ({
      pageParam,
      signal,
    }): Promise<CareerDevExternalFitsPage> => {
      const params = new URLSearchParams({
        months: String(months),
        offset: String(pageParam),
      });
      const response = await fetchWithAuth(
        `/api/talent/dev-external-fits?${params}`,
        {
          signal,
        }
      );
      if (!response.ok) throw new Error("외부 공고 fit을 불러오지 못했어요.");
      return response.json();
    },
    getNextPageParam: (page) => page.nextOffset ?? undefined,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const totalCount = query.data?.pages[0]?.totalCount;

  return (
    <TalentCareerModal
      open
      onClose={onClose}
      title="외부 공고 fit"
      description={
        <span aria-live="polite">
          {totalCount === undefined
            ? query.isError
              ? "전체 건수를 불러오지 못했어요."
              : "전체 건수 불러오는 중…"
            : `총 ${totalCount.toLocaleString("ko-KR")}개 · 점수 높은 순`}
        </span>
      }
      headerActions={
        <div className="flex flex-wrap gap-1.5" data-career-i18n-skip="true">
          {CAREER_DEV_EXTERNAL_FITS_MONTHS.map((value) => (
            <MuteButton
              key={value}
              size="sm"
              variant={value === months ? "neutral" : "default"}
              aria-pressed={value === months}
              onClick={() => setMonths(value)}
            >
              최근 {value}개월
            </MuteButton>
          ))}
        </div>
      }
      closeButtonAriaLabel="닫기"
      panelClassName="max-w-[880px]"
      bodyClassName="px-4 pb-5 sm:px-5"
    >
      <div data-career-i18n-skip="true" aria-busy={query.isFetching}>
        <Table className="min-w-[600px]">
          <TableHeader>
            <TableRow className="border-neutral-1000-a05">
              <TableHead scope="col" className="w-[25%]">
                회사
              </TableHead>
              <TableHead scope="col">Role</TableHead>
              <TableHead scope="col" className="w-20 text-right">
                점수
              </TableHead>
              <TableHead
                scope="col"
                className="w-32 whitespace-nowrap text-right"
              >
                체크한 날짜
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.roleId} className="border-neutral-1000-a05">
                <TableCell>{item.companyName || "—"}</TableCell>
                <TableCell className="break-words">{item.roleName}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.score ?? "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums text-neutral-muted">
                  <time dateTime={item.checkedAt} title={item.checkedAt}>
                    {checkDateFormatter.format(new Date(item.checkedAt))}
                  </time>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {query.isPending ? (
          <div
            role="status"
            className="flex items-center justify-center gap-2 py-10 text-sm text-neutral-muted"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden />
            불러오는 중…
          </div>
        ) : null}
        {!query.isPending && !query.isError && items.length === 0 ? (
          <p className="py-10 text-center text-sm text-neutral-muted">
            최근 {months}개월 내에 체크한 외부 공고 fit이 없어요.
          </p>
        ) : null}
        {query.isError ? (
          <div
            role="alert"
            className="flex flex-col items-center gap-2 py-6 text-sm text-critical"
          >
            <p>외부 공고 fit을 불러오지 못했어요.</p>
            <MuteButton
              onClick={() =>
                void (query.isFetchNextPageError
                  ? query.fetchNextPage()
                  : query.refetch())
              }
              disabled={query.isFetching}
            >
              다시 시도
            </MuteButton>
          </div>
        ) : null}
        {query.hasNextPage && !query.isError ? (
          <div className="flex justify-center pt-5">
            <MuteButton
              onClick={() => void query.fetchNextPage()}
              disabled={query.isFetching}
            >
              {query.isFetchingNextPage ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              {query.isFetchingNextPage ? "불러오는 중…" : "더보기"}
            </MuteButton>
          </div>
        ) : null}
      </div>
    </TalentCareerModal>
  );
}
