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
import type {
  AdminCareerFunnelStep,
  AdminCareerLandingSourceBreakdown,
} from "@/lib/adminCareerAnalytics/types";
import { Info } from "lucide-react";

type AdminCareerFunnelPanelProps = {
  landingSources: AdminCareerLandingSourceBreakdown[];
  steps: AdminCareerFunnelStep[];
};

const FUNNEL_TOOLTIPS: Record<string, string> = {
  landing_entry:
    "landing_logs에서 new_visit/new_session 계열 type을 unique local_id로 센 값입니다. 새 로그는 new_visit:career처럼 source suffix가 붙고, 과거 로그는 source가 unknown으로 표시됩니다.",
  login:
    "landing_logs에서 login_email:<email> 계열 type을 unique local_id로 센 값입니다. 새 로그는 login_email:<email>:search처럼 source suffix가 붙습니다.",
  onboarding_basic:
    "logs.type='career_click_onboarding_next_step_1' 유저 수입니다. 완료 유저가 로그보다 많으면 talent_setting.is_onboarding_done으로 보정합니다.",
  onboarding_role:
    "logs.type='career_click_onboarding_next_step_2' 유저 수입니다. 완료 유저가 로그보다 많으면 talent_setting.is_onboarding_done으로 보정합니다.",
  onboarding_profile:
    "logs.type='career_click_onboarding_next_step_3' 유저 수입니다. 완료 유저가 로그보다 많으면 talent_setting.is_onboarding_done으로 보정합니다.",
  onboarding_visibility:
    "logs.type='career_click_onboarding_submit_button' 또는 career_click_onboarding_submit 유저 수입니다. 완료 유저가 로그보다 많으면 talent_setting.is_onboarding_done으로 보정합니다.",
  onboarding_completed:
    "talent_activity_events.event_type='onboarding_completed' 첫 발생 기준입니다. 과거 이벤트가 없으면 talent_setting.is_onboarding_done=true 및 updated_at으로 보정합니다.",
  returned_after_first_recommendation:
    "첫 talent_opportunity_recommendation 시각 이후 career_app_opened 로그가 있거나 talent_users.last_logined_at이 더 늦은 유저 수입니다.",
};

const formatRate = (value: number | null) => {
  if (value === null) return "-";
  return `${Math.round(value * 100).toLocaleString("ko-KR")}%`;
};

export default function AdminCareerFunnelPanel({
  landingSources,
  steps,
}: AdminCareerFunnelPanelProps) {
  const maxCount = Math.max(...steps.map((step) => step.count), 1);

  return (
    <Card className="rounded-md border-black/10 shadow-none">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-[14px] font-semibold text-black">
          Landing to Career Funnel
        </CardTitle>
        <CardDescription className="text-[12px] leading-5 text-black/50">
          랜딩 진입부터 첫 추천 이후 재접속까지의 핵심 흐름입니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-2">
        {steps.map((step, index) => {
          const width = `${Math.max((step.count / maxCount) * 100, step.count > 0 ? 4 : 0)}%`;

          return (
            <div
              key={step.key}
              className="grid gap-2 md:grid-cols-[180px_1fr_130px] md:items-center"
            >
              <div>
                <Tooltips
                  text={FUNNEL_TOOLTIPS[step.key] || step.detail}
                  side="right"
                >
                  <button
                    type="button"
                    className="inline-flex cursor-help items-center gap-1 bg-transparent p-0 text-left text-[12px] font-medium text-black"
                  >
                    {index + 1}. {step.label}
                    <Info className="h-3 w-3 text-black/40" aria-hidden />
                  </button>
                </Tooltips>
                <div className="mt-0.5 text-[11px] text-black/40">
                  {step.detail}
                </div>
              </div>
              <div className="h-8 border border-black/10 bg-black/[0.03]">
                <div
                  className="h-full bg-black"
                  style={{ width }}
                  aria-hidden="true"
                />
              </div>
              <div className="flex items-center justify-between gap-2 md:block md:text-right">
                <div className="text-[15px] font-semibold leading-5 text-black">
                  {step.count.toLocaleString("ko-KR")}
                </div>
                <div className="text-[11px] leading-4 text-black/45">
                  prev {formatRate(step.rateFromPrevious)} · entry{" "}
                  {formatRate(step.rateFromEntry)}
                </div>
              </div>
            </div>
          );
        })}

        <div className="border-t border-black/10 pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <Tooltips text="landing_logs.type의 source suffix 기준 분해입니다. 과거에 source suffix 없이 들어온 new_visit/new_session/login_email 로그는 unknown으로 표시됩니다.">
              <button
                type="button"
                className="inline-flex cursor-help items-center gap-1 bg-transparent p-0 text-left text-[12px] font-medium text-black"
              >
                Landing log sources
                <Info className="h-3 w-3 text-black/40" aria-hidden />
              </button>
            </Tooltips>
            <div className="text-[11px] text-black/40">type suffix 기준</div>
          </div>
          <div className="overflow-x-auto">
            <Table className="min-w-[520px]">
              <TableHeader>
                <TableRow className="border-black/10 hover:bg-transparent">
                  <TableHead className="h-8 px-2 text-[11px]">Source</TableHead>
                  <TableHead className="h-8 px-2 text-right text-[11px]">
                    Entry
                  </TableHead>
                  <TableHead className="h-8 px-2 text-right text-[11px]">
                    Login
                  </TableHead>
                  <TableHead className="h-8 px-2 text-[11px]">Types</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {landingSources.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="px-2 py-4 text-center text-[11px] text-black/45"
                    >
                      source가 붙은 landing log가 아직 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  landingSources.map((source) => (
                    <TableRow key={source.source} className="border-black/10">
                      <TableCell className="px-2 py-1.5 text-[11px] font-medium text-black">
                        {source.source}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-right text-[11px] text-black/65">
                        {source.entryCount.toLocaleString("ko-KR")}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-right text-[11px] text-black/65">
                        {source.loginCount.toLocaleString("ko-KR")}
                      </TableCell>
                      <TableCell className="max-w-[260px] truncate px-2 py-1.5 text-[11px] text-black/45">
                        {source.eventTypes.join(", ") || "-"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
