import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tooltips } from "@/components/ui/tooltip";
import type { AdminCareerSummaryMetric } from "@/lib/adminCareerAnalytics/types";
import { Info } from "lucide-react";

type AdminCareerMetricGridProps = {
  metrics: AdminCareerSummaryMetric[];
};

const METRIC_TOOLTIPS: Record<string, string> = {
  careerUsers:
    "talent_users 기준 유저 수입니다. admin excluded emails에 걸리는 이메일/도메인은 제외합니다.",
  active7d:
    "lastActiveAt이 최근 7일 안인 유저입니다. lastActiveAt은 login_completed, talent_users.last_logined_at, career 로그, 유저 메시지, 추천 열람/클릭/피드백/status 변경 중 가장 최신값입니다. 시스템 추천 생성이나 talent_setting.updated_at만으로는 활동으로 보지 않습니다.",
  active30d:
    "lastActiveAt이 최근 30일 안인 유저입니다. 로그인, career 화면 로그, 유저 메시지, 추천 상호작용을 활동으로 봅니다.",
  onboardingCompleted:
    "talent_activity_events.event_type='onboarding_completed' 첫 발생 기준입니다. 과거 이벤트가 없으면 talent_setting.is_onboarding_done=true 및 updated_at으로 보정합니다.",
  recommendedUsers:
    "talent_opportunity_recommendation에서 추천 레코드를 1개 이상 받은 유저 수입니다.",
  engagedUsers:
    "메시지 발송, 추천 상세 열람, JD 클릭, 회사 클릭 중 하나라도 있는 유저 수입니다.",
  signalUsers:
    "추천 피드백, status 변경, 프로필/설정/이력서 링크 저장 같은 명시적 선호 신호가 있는 유저 수입니다.",
  returnedAfterFirstRecommendation:
    "첫 추천 시각 이후 login_completed, career 로그, 유저 메시지, 추천 열람/클릭/피드백/status 변경, 또는 talent_users.last_logined_at이 있는 유저 수입니다.",
  positiveFeedback:
    "talent_opportunity_recommendation.feedback='like' 레코드 수입니다. 과거 positive 값도 함께 인식합니다.",
  negativeFeedback:
    "talent_opportunity_recommendation.feedback='dislike' 레코드 수입니다. 과거 negative 값도 함께 인식합니다.",
};

export default function AdminCareerMetricGrid({
  metrics,
}: AdminCareerMetricGridProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {metrics.map((metric) => (
        <Card
          key={metric.key}
          className="rounded-md border-black/10 shadow-none"
        >
          <CardHeader className="space-y-1 p-3 pb-1">
            <CardDescription className="text-[11px] leading-4 text-black/45">
              <Tooltips
                text={
                  metric.tooltip ||
                  METRIC_TOOLTIPS[metric.key] ||
                  `${metric.label}: ${metric.detail}`
                }
              >
                <button
                  type="button"
                  className="inline-flex cursor-help items-center gap-1 bg-transparent p-0 text-left"
                >
                  {metric.label}
                  <Info className="h-3 w-3" aria-hidden="true" />
                </button>
              </Tooltips>
            </CardDescription>
            <CardTitle className="text-[20px] font-semibold leading-7 text-black">
              {metric.value.toLocaleString("ko-KR")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-[11px] leading-4 text-black/50">
              {metric.detail}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
