import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarDays, RotateCcw } from "lucide-react";
import type { DateRange } from "react-day-picker";

type AdminCareerDateRangeFilterProps = {
  appliedEndDate: string;
  appliedStartDate: string;
  isFetching: boolean;
  onApply: () => void;
  onChange: (value: DateRange | undefined) => void;
  onReset: () => void;
  value: DateRange | undefined;
};

const formatDate = (date: Date | undefined) => {
  if (!date) return "-";
  return date.toLocaleDateString("ko-KR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
};

const formatAppliedRange = (startDate: string, endDate: string) => {
  if (!startDate && !endDate) return "전체 기간";
  if (startDate && endDate) return `${startDate} ~ ${endDate}`;
  return startDate || endDate;
};

export default function AdminCareerDateRangeFilter({
  appliedEndDate,
  appliedStartDate,
  isFetching,
  onApply,
  onChange,
  onReset,
  value,
}: AdminCareerDateRangeFilterProps) {
  const hasDraftDate = Boolean(value?.from || value?.to);
  const hasAppliedDate = Boolean(appliedStartDate || appliedEndDate);

  return (
    <Card className="rounded-md border-black/10 shadow-none">
      <CardContent className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="space-y-3">
          <div>
            <div className="inline-flex items-center gap-2 text-[13px] font-semibold text-black">
              <CalendarDays className="h-4 w-4" aria-hidden />
              상단 지표 기간
            </div>
            <div className="mt-1 text-[12px] leading-5 text-black/50">
              Quick signal, metric, funnel, landing source를 선택 기간 기준으로 봅니다.
            </div>
          </div>

          <div className="grid gap-2 text-[12px] text-black/55 sm:grid-cols-2">
            <div className="border border-black/10 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.14em] text-black/35">
                Draft
              </div>
              <div className="mt-1 font-medium text-black">
                {formatDate(value?.from)} ~ {formatDate(value?.to)}
              </div>
            </div>
            <div className="border border-black/10 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.14em] text-black/35">
                Applied
              </div>
              <div className="mt-1 font-medium text-black">
                {formatAppliedRange(appliedStartDate, appliedEndDate)}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-none text-[12px]"
              onClick={onApply}
              disabled={!hasDraftDate || isFetching}
            >
              Apply
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-none border-black/15 bg-white text-[12px] text-black shadow-none"
              onClick={onReset}
              disabled={(!hasDraftDate && !hasAppliedDate) || isFetching}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden />
              Reset
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Calendar
            mode="range"
            selected={value}
            onSelect={onChange}
            numberOfMonths={2}
            disabled={{ after: new Date() }}
            className="p-2 text-[12px] [--cell-size:1.85rem]"
          />
        </div>
      </CardContent>
    </Card>
  );
}
