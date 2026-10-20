import { CompanySidePanelContent } from "./CompanySidePanelContent";
import { useState } from "react";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  LoaderCircle,
} from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { formatOpsCompanyDate } from "@/components/ops/dateUtils";
import { useOpsCompanyActivity } from "@/hooks/ops/useOpsCompany";
import type { OpsCompanyActivityItem } from "@/lib/ops/company";

function ActivityEntry({
  item,
  expanded = false,
}: {
  item: OpsCompanyActivityItem;
  expanded?: boolean;
}) {
  return (
    <div className="min-w-0 border-b border-neutral-1000-a05 py-3 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <p
          className={
            expanded
              ? "text-sm font-medium leading-6 text-neutral-primary"
              : "min-w-0 truncate text-sm font-medium text-neutral-primary"
          }
        >
          {item.title}
        </p>
        <time
          dateTime={item.occurredAt}
          className="shrink-0 pt-0.5 text-xs tabular-nums text-neutral-muted"
        >
          {formatOpsCompanyDate(item.occurredAt)}
        </time>
      </div>
    </div>
  );
}

export function CompanyActivityPanel({
  enabled,
  workspaceId,
}: {
  enabled: boolean;
  workspaceId: string;
}) {
  const [open, setOpen] = useState(false);
  const query = useOpsCompanyActivity({ enabled, workspaceId });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const status = query.isLoading
    ? "최근 활동을 불러오는 중입니다."
    : !items.length && !query.isError
      ? "기록된 활동이 없습니다."
      : null;
  const error = query.isError ? (
    <div role="alert" className="py-4 text-sm text-neutral-muted">
      활동을 불러오지 못했습니다.{" "}
      <MuteButton
        size="sm"
        onClick={() =>
          void (query.isFetchNextPageError
            ? query.fetchNextPage()
            : query.refetch())
        }
      >
        다시 시도
      </MuteButton>
    </div>
  ) : null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <section className="min-w-0 rounded-xl border border-neutral-1000-a05 bg-bg-floating p-4">
        <header className="mb-2 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Activity className="h-4 w-4 text-neutral-muted" />
            최근 활동
          </h2>
          <DialogTrigger asChild>
            <MuteButton
              size="sm"
              variant="transparent"
              aria-label="최근 활동 더보기"
            >
              더보기
              <ChevronRight className="h-3.5 w-3.5" />
            </MuteButton>
          </DialogTrigger>
        </header>
        {status && (
          <p className="py-8 text-center text-sm text-neutral-muted">
            {status}
          </p>
        )}
        {error}
        {items.slice(0, 5).map((item) => (
          <DialogTrigger key={item.id} asChild>
            <MuteButton
              type="button"
              variant="transparent"
              className="block h-auto w-full whitespace-normal rounded-none p-0 text-left text-neutral-primary hover:bg-transparent hover:text-neutral-primary active:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-800"
            >
              <ActivityEntry item={item} />
            </MuteButton>
          </DialogTrigger>
        ))}
      </section>
      <CompanySidePanelContent
        title="최근 활동"
        description="최신순 · 추천 실행별 대상 인원과 실행 유형을 확인할 수 있습니다."
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-2">
          {status && (
            <p className="py-6 text-sm text-neutral-muted">{status}</p>
          )}
          {items.map((item) => (
            <ActivityEntry key={item.id} item={item} expanded />
          ))}
          {error}
          {query.hasNextPage && (
            <MuteButton
              variant="transparent"
              className="my-3 w-full"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              이전 활동 더보기
            </MuteButton>
          )}
        </div>
      </CompanySidePanelContent>
    </Dialog>
  );
}
