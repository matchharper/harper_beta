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
import type { AdminCareerLandingVariantBreakdown } from "@/lib/adminCareerAnalytics/types";
import { BareButton } from "@/components/ui/button";
import { Info } from "lucide-react";

type AdminCareerAbtestPanelProps = {
  variants: AdminCareerLandingVariantBreakdown[];
};

const formatRate = (value: number | null) => {
  if (value === null) return "-";
  return `${Math.round(value * 1000) / 10}%`;
};

const formatCountWithRate = (count: number, rate: number | null) => (
  <div className="text-right">
    <div className="text-[13px] font-semibold text-black">
      {count.toLocaleString("ko-KR")}
    </div>
    <div className="text-[11px] text-black/45">{formatRate(rate)}</div>
  </div>
);

export default function AdminCareerAbtestPanel({
  variants,
}: AdminCareerAbtestPanelProps) {
  return (
    <Card className="rounded-md border-black/10 shadow-none">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-[14px] font-semibold text-black">
              Landing A/B Tests
            </CardTitle>
            <CardDescription className="text-[12px] leading-5 text-black/50">
              랜딩 실험별 Entry → CTA/Email → Login → Signup 전환입니다.
            </CardDescription>
          </div>
          <Tooltips text="Entry는 landing_logs new_visit/new_session unique local_id, CTA click은 click_start, Email submit/sent는 email_capture_* 로그, Login은 login_email 로그 기준입니다. Signup은 login_email로 식별된 talent user 중 career_signup_completed 또는 talent_users.created_at이 선택 기간에 잡힌 유저입니다.">
            <BareButton
              type="button"
              className="inline-flex h-7 w-7 shrink-0 cursor-help items-center justify-center border border-black/10 bg-white text-black/45"
            >
              <Info className="h-3.5 w-3.5" aria-hidden />
            </BareButton>
          </Tooltips>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        <div className="overflow-x-auto">
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow className="border-black/10 hover:bg-transparent">
                <TableHead className="h-8 px-2 text-[11px]">Variant</TableHead>
                <TableHead className="h-8 px-2 text-right text-[11px]">
                  Entry
                </TableHead>
                <TableHead className="h-8 px-2 text-right text-[11px]">
                  CTA click
                </TableHead>
                <TableHead className="h-8 px-2 text-right text-[11px]">
                  Email submit
                </TableHead>
                <TableHead className="h-8 px-2 text-right text-[11px]">
                  Email sent
                </TableHead>
                <TableHead className="h-8 px-2 text-right text-[11px]">
                  Login
                </TableHead>
                <TableHead className="h-8 px-2 text-right text-[11px]">
                  Signup
                </TableHead>
                <TableHead className="h-8 px-2 text-[11px]">Events</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {variants.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="px-2 py-4 text-center text-[11px] text-black/45"
                  >
                    아직 A/B test landing log가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                variants.map((variant) => (
                  <TableRow
                    key={variant.abtestType}
                    className="border-black/10"
                  >
                    <TableCell className="px-2 py-2">
                      <div className="text-[12px] font-semibold text-black">
                        {variant.label}
                      </div>
                      <div className="mt-0.5 max-w-[280px] text-[11px] leading-4 text-black/50">
                        {variant.description}
                      </div>
                      <div className="mt-1 break-all font-mono text-[10px] text-black/35">
                        {variant.abtestType}
                      </div>
                    </TableCell>
                    <TableCell className="px-2 py-2 text-right text-[13px] font-semibold text-black">
                      {variant.entryCount.toLocaleString("ko-KR")}
                    </TableCell>
                    <TableCell className="px-2 py-2">
                      {formatCountWithRate(
                        variant.clickStartCount,
                        variant.clickStartRateFromEntry
                      )}
                      <div className="text-right text-[10px] text-black/35">
                        from entry
                      </div>
                    </TableCell>
                    <TableCell className="px-2 py-2">
                      {formatCountWithRate(
                        variant.emailSubmitCount,
                        variant.emailSubmitRateFromEntry
                      )}
                      <div className="text-right text-[10px] text-black/35">
                        from entry
                      </div>
                    </TableCell>
                    <TableCell className="px-2 py-2">
                      {formatCountWithRate(
                        variant.emailSentCount,
                        variant.emailSentRateFromSubmit
                      )}
                      <div className="text-right text-[10px] text-black/35">
                        from submit
                      </div>
                    </TableCell>
                    <TableCell className="px-2 py-2">
                      {formatCountWithRate(
                        variant.loginCount,
                        variant.loginRateFromEntry
                      )}
                      <div className="text-right text-[10px] text-black/35">
                        from click {formatRate(variant.loginRateFromClickStart)}
                      </div>
                    </TableCell>
                    <TableCell className="px-2 py-2">
                      {formatCountWithRate(
                        variant.signupCount,
                        variant.signupRateFromEntry
                      )}
                      <div className="text-right text-[10px] text-black/35">
                        from login {formatRate(variant.signupRateFromLogin)}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate px-2 py-2 text-[11px] text-black/45">
                      {variant.eventTypes.join(", ") || "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
