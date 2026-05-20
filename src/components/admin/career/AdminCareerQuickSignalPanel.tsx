import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tooltips } from "@/components/ui/tooltip";
import type { AdminCareerQuickSignal } from "@/lib/adminCareerAnalytics/types";
import { Info } from "lucide-react";

type AdminCareerQuickSignalPanelProps = {
  signals: AdminCareerQuickSignal[];
};

const formatRate = (value: number | null) => {
  if (value === null) return "-";
  return `${Math.round(value * 100).toLocaleString("ko-KR")}%`;
};

export default function AdminCareerQuickSignalPanel({
  signals,
}: AdminCareerQuickSignalPanelProps) {
  return (
    <Card className="rounded-md border-black/10 shadow-none">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-[14px] font-semibold text-black">
          Quick Product Signals
        </CardTitle>
        <CardDescription className="text-[12px] leading-5 text-black/50">
          선택 기간 안에서 가입, 제출, 완료, 첫 추천 후 재접속만 빠르게 봅니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 pt-2 md:grid-cols-3">
        {signals.map((signal) => (
          <div key={signal.key} className="border border-black/10 p-3">
            <Tooltips text={signal.tooltip}>
              <button
                type="button"
                className="inline-flex cursor-help items-center gap-1 bg-transparent p-0 text-left text-[12px] font-medium text-black"
              >
                {signal.label}
                <Info className="h-3 w-3 text-black/40" aria-hidden />
              </button>
            </Tooltips>
            <div className="mt-2 text-[24px] font-semibold leading-8 text-black">
              {formatRate(signal.rate)}
            </div>
            <div className="mt-1 text-[12px] text-black/55">
              {signal.numerator.toLocaleString("ko-KR")} /{" "}
              {signal.denominator.toLocaleString("ko-KR")}
            </div>
            <div className="mt-1 text-[11px] leading-4 text-black/45">
              {signal.detail}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
