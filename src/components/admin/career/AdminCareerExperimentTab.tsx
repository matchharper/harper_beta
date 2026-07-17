import {
  type AdminCareerAnalyticsDateRange,
  useAdminCareerAnalyticsStore,
} from "@/components/admin/career/useAdminCareerAnalyticsStore";
import { BareButton, Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ADMIN_PAGE_PASSWORD } from "@/lib/admin";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronDown, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";

type AdminCareerExperimentVariant = {
  abtestType: string;
  entryCount: number;
  key: "email_first" | "login_first";
  label: string;
  onboardingCompletedCount: number;
  onboardingCompletedRateFromEntry: number | null;
  signupCount: number;
  signupRateFromEntry: number | null;
  submissionCount: number;
  submissionRateFromEntry: number | null;
};

type AdminCareerExperimentResponse = {
  dateRange: {
    endDate: string | null;
    isActive: boolean;
    startDate: string | null;
  };
  generatedAt: string;
  variants: AdminCareerExperimentVariant[];
};

type AdminCareerExperimentTabProps = {
  excludedEmails: string[];
};

const toDateOnly = (date: Date | undefined) => {
  if (!date) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateOnly = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }

  return date;
};

const dateRangeInputToSelection = (
  value: AdminCareerAnalyticsDateRange
): DateRange | undefined => {
  const from = parseDateOnly(value.startDate);
  const to = parseDateOnly(value.endDate);
  if (!from && !to) return undefined;

  return {
    from: from ?? to,
    to: to ?? from,
  };
};

const dateRangeSelectionToInput = (
  value: DateRange | undefined
): AdminCareerAnalyticsDateRange => {
  const startDate = toDateOnly(value?.from);
  const endDate = toDateOnly(value?.to ?? value?.from);
  return { endDate, startDate };
};

const formatDate = (date: Date | undefined) => {
  if (!date) return "";
  return date.toLocaleDateString("ko-KR", {
    day: "2-digit",
    month: "2-digit",
  });
};

const formatDateRangeLabel = (value: AdminCareerAnalyticsDateRange) => {
  const range = dateRangeInputToSelection(value);
  if (!range?.from) return "전체 기간";

  const from = formatDate(range.from);
  const to = formatDate(range.to ?? range.from);
  return from === to ? from : `${from} - ${to}`;
};

const formatCount = (value: number) => value.toLocaleString("ko-KR");

const formatRate = (value: number | null) => {
  if (value === null) return "-";
  return `${Math.round(value * 1000) / 10}%`;
};

async function fetchExperimentAnalytics(
  excludedEmails: string[],
  dateRange: AdminCareerAnalyticsDateRange
) {
  const response = await fetch("/api/admin/career/experiment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": ADMIN_PAGE_PASSWORD,
    },
    body: JSON.stringify({
      dateRange:
        dateRange.startDate || dateRange.endDate ? dateRange : undefined,
      excludedEmails,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as
    | AdminCareerExperimentResponse
    | { error?: string };

  if (!response.ok) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : "Experiment analytics를 불러오지 못했습니다."
    );
  }

  return payload as AdminCareerExperimentResponse;
}

function DateRangeButton({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean;
  onChange: (value: AdminCareerAnalyticsDateRange) => void;
  value: AdminCareerAnalyticsDateRange;
}) {
  const [open, setOpen] = useState(false);
  const [draftDateRange, setDraftDateRange] = useState<DateRange | undefined>();
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedDateRange = useMemo(
    () => dateRangeInputToSelection(value),
    [value]
  );

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!containerRef.current?.contains(target)) setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [open]);

  const openCalendar = () => {
    setDraftDateRange(selectedDateRange);
    setOpen((current) => !current);
  };

  const apply = () => {
    onChange(dateRangeSelectionToInput(draftDateRange));
    setOpen(false);
  };

  const reset = () => {
    setDraftDateRange(undefined);
    onChange({ endDate: "", startDate: "" });
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-8 rounded-none border-black/15 bg-white text-[12px] text-black shadow-none"
        onClick={openCalendar}
        disabled={disabled}
      >
        <CalendarDays className="h-3.5 w-3.5" aria-hidden />
        {formatDateRangeLabel(value)}
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition", open && "rotate-180")}
          aria-hidden
        />
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-label="Experiment date range"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[316px] border border-black/10 bg-white p-2 shadow-xl"
        >
          <Calendar
            mode="range"
            selected={draftDateRange}
            onSelect={setDraftDateRange}
            numberOfMonths={1}
            disabled={{ after: new Date() }}
            className="p-2 text-[12px] [--cell-size:1.85rem]"
          />
          <div className="mt-2 flex items-center justify-end gap-2 border-t border-black/10 pt-2">
            <BareButton
              type="button"
              className="h-7 px-2 text-[11px] text-black/55 disabled:opacity-40"
              onClick={reset}
              disabled={
                !draftDateRange?.from && !value.startDate && !value.endDate
              }
            >
              초기화
            </BareButton>
            <BareButton
              type="button"
              className="h-7 bg-black px-2.5 text-[11px] font-medium text-white"
              onClick={apply}
            >
              확인
            </BareButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MetricCell({ count, rate }: { count: number; rate: number | null }) {
  return (
    <div className="text-right">
      <div className="text-[13px] font-semibold text-black">
        {formatCount(count)}
      </div>
      <div className="text-[11px] text-black/45">{formatRate(rate)}</div>
    </div>
  );
}

export default function AdminCareerExperimentTab({
  excludedEmails,
}: AdminCareerExperimentTabProps) {
  const appliedDateRange = useAdminCareerAnalyticsStore(
    (state) => state.dateRange
  );
  const hasHydratedDateRange = useAdminCareerAnalyticsStore(
    (state) => state.hasHydrated
  );
  const setAppliedDateRange = useAdminCareerAnalyticsStore(
    (state) => state.setDateRange
  );

  const query = useQuery({
    queryKey: [
      "admin-career-experiment",
      excludedEmails,
      appliedDateRange.startDate,
      appliedDateRange.endDate,
    ],
    queryFn: () => fetchExperimentAnalytics(excludedEmails, appliedDateRange),
    enabled: hasHydratedDateRange,
    placeholderData: (previousData) => previousData,
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <DateRangeButton
          disabled={!hasHydratedDateRange || query.isFetching}
          onChange={setAppliedDateRange}
          value={appliedDateRange}
        />
      </div>

      {query.error ? (
        <Card className="rounded-md border-red-200 bg-red-50 shadow-none">
          <CardContent className="p-4 text-[12px] text-red-700">
            {query.error instanceof Error
              ? query.error.message
              : "Experiment analytics를 불러오지 못했습니다."}
          </CardContent>
        </Card>
      ) : null}

      <Card className="rounded-md border-black/10 shadow-none">
        <CardContent className="p-0">
          {!hasHydratedDateRange || query.isLoading ? (
            <div className="flex items-center gap-2 p-4 text-[12px] text-black/50">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              Loading
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow className="border-black/10 hover:bg-transparent">
                    <TableHead className="h-9 px-3 text-[11px]">Flow</TableHead>
                    <TableHead className="h-9 px-3 text-right text-[11px]">
                      Entry
                    </TableHead>
                    <TableHead className="h-9 px-3 text-right text-[11px]">
                      Signup
                    </TableHead>
                    <TableHead className="h-9 px-3 text-right text-[11px]">
                      Submit
                    </TableHead>
                    <TableHead className="h-9 px-3 text-right text-[11px]">
                      Done
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(query.data?.variants ?? []).map((variant) => (
                    <TableRow key={variant.key} className="border-black/10">
                      <TableCell className="px-3 py-3">
                        <div className="text-[13px] font-semibold text-black">
                          {variant.label}
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-3 text-right text-[13px] font-semibold text-black">
                        {formatCount(variant.entryCount)}
                      </TableCell>
                      <TableCell className="px-3 py-3">
                        <MetricCell
                          count={variant.signupCount}
                          rate={variant.signupRateFromEntry}
                        />
                      </TableCell>
                      <TableCell className="px-3 py-3">
                        <MetricCell
                          count={variant.submissionCount}
                          rate={variant.submissionRateFromEntry}
                        />
                      </TableCell>
                      <TableCell className="px-3 py-3">
                        <MetricCell
                          count={variant.onboardingCompletedCount}
                          rate={variant.onboardingCompletedRateFromEntry}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
