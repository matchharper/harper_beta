import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltips } from "@/components/ui/tooltip";
import type { AdminCareerDeviceComparisonRow } from "@/lib/adminCareerAnalytics/types";
import { Info } from "lucide-react";

type AdminCareerDeviceComparisonPanelProps = {
  rows: AdminCareerDeviceComparisonRow[];
};

const formatRate = (value: number | null) => {
  if (value === null) return "-";
  return `${Math.round(value * 100).toLocaleString("ko-KR")}%`;
};

const formatCountWithRate = (count: number, rate: number | null) => (
  <div className="text-right">
    <div className="text-[13px] font-semibold text-black">
      {count.toLocaleString("ko-KR")}
    </div>
    <div className="text-[11px] text-black/45">{formatRate(rate)}</div>
  </div>
);

export default function AdminCareerDeviceComparisonPanel({
  rows,
}: AdminCareerDeviceComparisonPanelProps) {
  const maxEntryCount = Math.max(...rows.map((row) => row.entryCount), 1);

  return (
    <Card className="rounded-md border-black/10 shadow-none">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-[14px] font-semibold text-black">
              Device conversion comparison
            </CardTitle>
            <CardDescription className="text-[12px] leading-5 text-black/50">
              landing_logs.is_mobile 기준으로 진입부터 재진입까지 비교합니다.
            </CardDescription>
          </div>
          <Tooltips text="진입은 선택 기간의 landing_logs new_visit/new_session unique local_id입니다. 로그인은 같은 local_id의 login_email 로그, 제출/온보딩/재진입은 해당 local_id로 로그인한 유저의 선택 기간 이벤트 기준입니다.">
            <button
              type="button"
              className="inline-flex h-7 w-7 shrink-0 cursor-help items-center justify-center border border-black/10 bg-white text-black/45"
            >
              <Info className="h-3.5 w-3.5" aria-hidden />
            </button>
          </Tooltips>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-2">
        <div className="grid gap-2 md:grid-cols-3">
          {rows.map((row) => {
            const width = `${Math.max(
              (row.entryCount / maxEntryCount) * 100,
              row.entryCount > 0 ? 6 : 0
            )}%`;

            return (
              <div key={row.device} className="border border-black/10 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[12px] font-semibold text-black">
                    {row.label}
                  </div>
                  <div className="text-[12px] text-black/55">
                    entry {row.entryCount.toLocaleString("ko-KR")}
                  </div>
                </div>
                <div className="mt-2 h-2 border border-black/10 bg-black/[0.03]">
                  <div
                    className="h-full bg-black"
                    style={{ width }}
                    aria-hidden="true"
                  />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-black/50">
                  <div>login {formatRate(row.loginRateFromEntry)}</div>
                  <div>
                    done {formatRate(row.onboardingCompletionRateFromSubmitted)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="overflow-x-auto">
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow className="border-black/10 hover:bg-transparent">
                <TableHead className="h-8 px-2 text-[11px]">Device</TableHead>
                <TableHead className="h-8 px-2 text-right text-[11px]">
                  진입
                </TableHead>
                <TableHead className="h-8 px-2 text-right text-[11px]">
                  로그인
                </TableHead>
                <TableHead className="h-8 px-2 text-right text-[11px]">
                  제출
                </TableHead>
                <TableHead className="h-8 px-2 text-right text-[11px]">
                  온보딩 완료
                </TableHead>
                <TableHead className="h-8 px-2 text-right text-[11px]">
                  재진입
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.device} className="border-black/10">
                  <TableCell className="px-2 py-2 text-[12px] font-semibold text-black">
                    {row.label}
                  </TableCell>
                  <TableCell className="px-2 py-2 text-right text-[13px] font-semibold text-black">
                    {row.entryCount.toLocaleString("ko-KR")}
                  </TableCell>
                  <TableCell className="px-2 py-2">
                    {formatCountWithRate(
                      row.loginCount,
                      row.loginRateFromEntry
                    )}
                  </TableCell>
                  <TableCell className="px-2 py-2">
                    {formatCountWithRate(
                      row.submittedCount,
                      row.submissionRateFromLogin
                    )}
                    <div className="text-right text-[10px] text-black/35">
                      entry {formatRate(row.submissionRateFromEntry)}
                    </div>
                  </TableCell>
                  <TableCell className="px-2 py-2">
                    {formatCountWithRate(
                      row.onboardingCompletedCount,
                      row.onboardingCompletionRateFromSubmitted
                    )}
                    <div className="text-right text-[10px] text-black/35">
                      entry {formatRate(row.onboardingCompletionRateFromEntry)}
                    </div>
                  </TableCell>
                  <TableCell className="px-2 py-2">
                    {formatCountWithRate(
                      row.returnedAfterFirstRecommendationCount,
                      row.returnRateFromFirstRecommendation
                    )}
                    <div className="text-right text-[10px] text-black/35">
                      entry {formatRate(row.returnRateFromEntry)}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
